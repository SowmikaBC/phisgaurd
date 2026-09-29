import { Router, type IRouter, type Request } from "express";
import crypto from "node:crypto";
import { promisify } from "node:util";
import cookieParser from "cookie-parser";
import { pool } from "@workspace/db";
import {
  AnalyzeUrlBody,
  LoginBody,
  RegisterBody,
  SubmitQuizBody,
} from "@workspace/api-zod";

const router: IRouter = Router();
const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = "phishguard_session";
const DEMO_EMAIL = "demo@phishguard.ai";

type UserRow = { id: number; name: string; email: string };
type Feature = {
  label: string;
  value: string;
  status: "positive" | "caution" | "danger";
  detail: string;
};

function publicUser(row: UserRow) {
  return { id: String(row.id), name: row.name, email: row.email };
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function comparePassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return crypto.timingSafeEqual(Buffer.from(key, "hex"), derived);
}

async function ensureDemoUser() {
  const existing = await pool.query<UserRow>(
    "select id, name, email from phishguard_users where email = $1 limit 1",
    [DEMO_EMAIL],
  );
  if (existing.rows[0]) return existing.rows[0];
  const passwordHash = await hashPassword("demo-password-123");
  const created = await pool.query<UserRow>(
    "insert into phishguard_users (name, email, password_hash) values ($1, $2, $3) returning id, name, email",
    ["Demo Analyst", DEMO_EMAIL, passwordHash],
  );
  return created.rows[0];
}

async function getActiveUser(req: Request) {
  const sessionId = req.signedCookies?.[SESSION_COOKIE];
  if (sessionId && /^\d+$/.test(sessionId)) {
    const result = await pool.query<UserRow>(
      "select id, name, email from phishguard_users where id = $1 limit 1",
      [Number(sessionId)],
    );
    if (result.rows[0]) return result.rows[0];
  }
  return ensureDemoUser();
}

function analyzeUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Please enter a valid website URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("Only http and https website URLs can be analyzed.");
  }

  const full = parsed.toString();
  const hostname = parsed.hostname;
  const labels = hostname.split(".").filter(Boolean);
  const suspiciousKeywords = [
    "login",
    "verify",
    "secure",
    "account",
    "update",
    "wallet",
    "password",
    "signin",
    "payment",
    "confirm",
  ].filter((keyword) => full.toLowerCase().includes(keyword));
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  const specialCharacters = (full.match(/[!@#$%^&*_=+~]/g) ?? []).length;
  const digitCount = (full.match(/\d/g) ?? []).length;
  const hyphenCount = (full.match(/-/g) ?? []).length;
  const encodedCount = (full.match(/%[0-9a-f]{2}/gi) ?? []).length;
  const pathSegments = parsed.pathname.split("/").filter(Boolean).length;
  const queryParams = [...parsed.searchParams.keys()].length;
  const subdomains = Math.max(labels.length - 2, 0);

  let score = parsed.protocol === "https:" ? 6 : 24;
  const riskIndicators: string[] = [];
  const positiveIndicators: string[] = [];
  if (parsed.protocol === "https:") positiveIndicators.push("HTTPS encryption is present");
  else riskIndicators.push("The URL does not use HTTPS");
  if (full.length > 100) {
    score += 10;
    riskIndicators.push("Unusually long URL");
  }
  if (full.length > 180) {
    score += 10;
    riskIndicators.push("Very long URL structure");
  }
  if (isIp) {
    score += 34;
    riskIndicators.push("An IP address is used instead of a domain name");
  } else {
    positiveIndicators.push("A named domain is used");
  }
  if (subdomains >= 3) {
    score += 13;
    riskIndicators.push("Multiple subdomains make the destination harder to verify");
  } else if (subdomains <= 1) {
    positiveIndicators.push("Domain structure is relatively simple");
  }
  if (suspiciousKeywords.length) {
    score += Math.min(30, suspiciousKeywords.length * 10);
    riskIndicators.push(`Sensitive-action keyword detected: ${suspiciousKeywords[0]}`);
  }
  if (specialCharacters > 5) {
    score += Math.min(12, specialCharacters);
    riskIndicators.push("Several special characters appear in the URL");
  }
  if (digitCount > 6) {
    score += 7;
    riskIndicators.push("The URL contains an unusual number of digits");
  }
  if (hyphenCount > 1) {
    score += 6;
    riskIndicators.push("Several hyphens make the domain harder to read");
  }
  if (encodedCount) {
    score += 6;
    riskIndicators.push("Encoded characters obscure part of the destination");
  }
  if (pathSegments <= 3 && !queryParams) positiveIndicators.push("Path and query structure are compact");

  const riskScore = Math.min(100, Math.round(score));
  const classification = riskScore <= 30 ? "safe" : riskScore <= 60 ? "suspicious" : "high-risk";
  const riskLevel = riskScore <= 30 ? "LOW RISK" : riskScore <= 60 ? "MEDIUM RISK" : "HIGH RISK";
  const prediction =
    classification === "safe"
      ? "Low-risk pattern"
      : classification === "suspicious"
        ? "Potentially suspicious pattern"
        : "Potential phishing risk detected";

  const features: Feature[] = [
    {
      label: "HTTPS",
      value: parsed.protocol === "https:" ? "Present" : "Missing",
      status: parsed.protocol === "https:" ? "positive" : "danger",
      detail: parsed.protocol === "https:" ? "Connection is encrypted in transit." : "This destination does not advertise encrypted transport.",
    },
    {
      label: "Domain pattern",
      value: isIp ? "IP address" : `${hostname.length} characters`,
      status: isIp ? "danger" : "positive",
      detail: isIp ? "IP-only links are harder to independently verify." : "A named domain is easier to compare with the expected brand.",
    },
    {
      label: "Subdomains",
      value: String(subdomains),
      status: subdomains >= 3 ? "caution" : "positive",
      detail: subdomains >= 3 ? "Many nested labels can hide the registered domain." : "The number of nested labels is not unusual.",
    },
    {
      label: "Keywords",
      value: suspiciousKeywords.length ? suspiciousKeywords.join(", ") : "None found",
      status: suspiciousKeywords.length ? "caution" : "positive",
      detail: suspiciousKeywords.length ? "Language about accounts, payment, or verification deserves extra care." : "No common high-pressure keywords were detected.",
    },
    {
      label: "URL length",
      value: `${full.length} chars`,
      status: full.length > 100 ? "caution" : "positive",
      detail: full.length > 100 ? "Long URLs can make the final destination difficult to see." : "The URL length is within a common range.",
    },
    {
      label: "Special characters",
      value: String(specialCharacters),
      status: specialCharacters > 5 ? "caution" : "positive",
      detail: specialCharacters > 5 ? "A dense symbol pattern can obscure intent." : "No unusual concentration of symbols was found.",
    },
  ];

  return {
    url: full,
    riskScore,
    classification,
    prediction,
    riskLevel,
    features,
    positiveIndicators: positiveIndicators.slice(0, 4),
    riskIndicators: riskIndicators.slice(0, 6),
    recommendation:
      riskScore > 60
        ? "Avoid entering passwords, financial information, or other sensitive data unless you can independently verify the website."
        : riskScore > 30
          ? "Pause before signing in or sharing information. Verify the domain through a trusted source."
          : "No strong risk signals were found, but continue to verify the domain before sharing sensitive information.",
  };
}

async function scanFromRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    url: row.url,
    riskScore: row.risk_score,
    classification: row.classification,
    prediction: row.prediction,
    riskLevel: row.risk_level,
    features: JSON.parse(String(row.features)),
    positiveIndicators: JSON.parse(String(row.positive_indicators)),
    riskIndicators: JSON.parse(String(row.risk_indicators)),
    recommendation: row.recommendation,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

router.use(cookieParser(process.env.SESSION_SECRET ?? "phishguard-development-secret"));

router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please complete all fields correctly." });
  const email = parsed.data.email.toLowerCase();
  const exists = await pool.query("select id from phishguard_users where email = $1", [email]);
  if (exists.rows[0]) return res.status(400).json({ error: "An account with that email already exists." });
  const passwordHash = await hashPassword(parsed.data.password);
  const created = await pool.query<UserRow>(
    "insert into phishguard_users (name, email, password_hash) values ($1, $2, $3) returning id, name, email",
    [parsed.data.name, email, passwordHash],
  );
  res.cookie(SESSION_COOKIE, String(created.rows[0].id), { signed: true, httpOnly: true, sameSite: "lax" });
  return res.status(201).json(publicUser(created.rows[0]));
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) return res.status(401).json({ error: "Invalid email or password." });
  const result = await pool.query<UserRow & { password_hash: string }>(
    "select id, name, email, password_hash from phishguard_users where email = $1 limit 1",
    [parsed.data.email.toLowerCase()],
  );
  if (!result.rows[0] || !(await comparePassword(parsed.data.password, result.rows[0].password_hash))) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  res.cookie(SESSION_COOKIE, String(result.rows[0].id), { signed: true, httpOnly: true, sameSite: "lax" });
  return res.json(publicUser(result.rows[0]));
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  return res.status(204).send();
});

router.get("/auth/me", async (req, res) => {
  const user = await getActiveUser(req);
  return res.json({ user: publicUser(user) });
});

router.post("/analyze", async (req, res) => {
  const parsed = AnalyzeUrlBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please enter a valid website URL." });
  try {
    const user = await getActiveUser(req);
    const result = analyzeUrl(parsed.data.url);
    const inserted = await pool.query(
      `insert into phishguard_scans
        (user_id, url, risk_score, classification, prediction, risk_level, features, positive_indicators, risk_indicators, recommendation)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        returning id, url, risk_score, classification, prediction, risk_level, features, positive_indicators, risk_indicators, recommendation, created_at`,
      [
        user.id,
        result.url,
        result.riskScore,
        result.classification,
        result.prediction,
        result.riskLevel,
        JSON.stringify(result.features),
        JSON.stringify(result.positiveIndicators),
        JSON.stringify(result.riskIndicators),
        result.recommendation,
      ],
    );
    return res.json(await scanFromRow(inserted.rows[0]));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "We could not analyze that URL." });
  }
});

router.get("/scans", async (req, res) => {
  const user = await getActiveUser(req);
  const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const classification = typeof req.query.classification === "string" ? req.query.classification : "all";
  const result = await pool.query(
    `select id, url, risk_score, classification, prediction, risk_level, features, positive_indicators, risk_indicators, recommendation, created_at
     from phishguard_scans where user_id = $1 order by created_at desc limit 100`,
    [user.id],
  );
  const scans = await Promise.all(result.rows.map(scanFromRow));
  return res.json(scans.filter((scan) => {
    const matchesQuery = !query || String(scan.url).toLowerCase().includes(query);
    const matchesClass = classification === "all" || scan.classification === classification;
    return matchesQuery && matchesClass;
  }));
});

router.delete("/scans", async (req, res) => {
  const user = await getActiveUser(req);
  const id = typeof req.query.id === "string" ? Number(req.query.id) : NaN;
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid scan id." });
  await pool.query("delete from phishguard_scans where id = $1 and user_id = $2", [id, user.id]);
  return res.status(204).send();
});

router.get("/dashboard", async (req, res) => {
  const user = await getActiveUser(req);
  const counts = await pool.query(
    `select
      count(*)::int as total,
      count(*) filter (where classification = 'safe')::int as safe,
      count(*) filter (where classification = 'suspicious')::int as suspicious,
      count(*) filter (where classification = 'high-risk')::int as high_risk,
      coalesce(round(avg(risk_score)), 0)::int as average
     from phishguard_scans where user_id = $1`,
    [user.id],
  );
  const recent = await pool.query(
    `select id, url, risk_score, classification, prediction, risk_level, features, positive_indicators, risk_indicators, recommendation, created_at
     from phishguard_scans where user_id = $1 order by created_at desc limit 5`,
    [user.id],
  );
  const activity = await pool.query(
    `select to_char(date_trunc('day', created_at), 'Mon DD') as label, count(*)::int as scans, round(avg(risk_score))::int as risk
     from phishguard_scans where user_id = $1 and created_at >= now() - interval '6 days'
     group by date_trunc('day', created_at) order by date_trunc('day', created_at)`,
    [user.id],
  );
  const row = counts.rows[0];
  return res.json({
    totalScans: row.total,
    safeCount: row.safe,
    suspiciousCount: row.suspicious,
    highRiskCount: row.high_risk,
    averageRiskScore: row.average,
    recentScans: await Promise.all(recent.rows.map(scanFromRow)),
    activity: activity.rows.map((entry) => ({ label: entry.label, scans: entry.scans, risk: entry.risk })),
    modelStatus: "Rule-based baseline active · ML pipeline ready for trained model",
  });
});

router.post("/quiz/submit", async (req, res) => {
  const parsed = SubmitQuizBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Quiz result is incomplete." });
  const user = await getActiveUser(req);
  const saved = await pool.query(
    `insert into phishguard_quiz_results (user_id, score, total_questions, percentage)
     values ($1,$2,$3,$4) returning id, score, total_questions, percentage, created_at`,
    [user.id, parsed.data.score, parsed.data.totalQuestions, parsed.data.percentage],
  );
  const row = saved.rows[0];
  return res.json({
    id: String(row.id),
    score: row.score,
    totalQuestions: row.total_questions,
    percentage: row.percentage,
    createdAt: new Date(row.created_at).toISOString(),
  });
});

router.get("/profile", async (req, res) => {
  const user = await getActiveUser(req);
  const counts = await pool.query(
    `select count(*)::int as total,
      count(*) filter (where classification = 'safe')::int as safe,
      count(*) filter (where classification = 'suspicious')::int as suspicious,
      count(*) filter (where classification = 'high-risk')::int as high_risk
     from phishguard_scans where user_id = $1`,
    [user.id],
  );
  const row = counts.rows[0];
  return res.json({
    ...publicUser(user),
    totalScans: row.total,
    safeScans: row.safe,
    suspiciousScans: row.suspicious,
    highRiskScans: row.high_risk,
  });
});

export default router;
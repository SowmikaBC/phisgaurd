import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, CircleHelp,
  Gauge, Globe2, GraduationCap, History,
  KeyRound, LayoutDashboard, Link2, LockKeyhole, LogIn, LogOut, Menu, Radar,
  RefreshCw, Search, Send, Shield, ShieldCheck, ShieldQuestion, Sparkles,
  Trash2, TrendingUp, UserRound, Users, X, XCircle, Zap,
} from 'lucide-react';
import {
  getGetCurrentUserQueryKey,
  getHealthCheckQueryKey,
  useAnalyzeUrl,
  useGetCurrentUser,
  useGetDashboard,
  useGetProfile,
  useHealthCheck,
  useListScans,
  useLogin,
  useLogout,
  useRegister,
  useSubmitQuiz,
  useDeleteScan,
} from '@workspace/api-client-react';
import type { Scan, User } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';

const queryClient = new QueryClient();

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/analyze', label: 'Analyze URL', icon: Radar },
  { href: '/history', label: 'Scan history', icon: History },
  { href: '/simulator', label: 'What-if simulator', icon: Sparkles },
  { href: '/quiz', label: 'Awareness quiz', icon: GraduationCap },
  { href: '/learn', label: 'Learn security', icon: BookOpen },
  { href: '/browser-protection', label: 'Browser protection', icon: ShieldCheck },
];

type AsyncStateProps = { message?: string; onRetry?: () => void };

function LoadingState({ message = 'Loading secure workspace…' }: AsyncStateProps) {
  return <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-3xl border border-border bg-card p-8 text-center" data-testid="state-loading">
    <div className="flex items-center gap-1.5" aria-label="Loading">
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /><span className="h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:150ms]" /><span className="h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
    </div>
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>;
}

function ErrorState({ message = 'We could not load this view.', onRetry }: AsyncStateProps) {
  return <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center" data-testid="state-error">
    <div className="rounded-2xl bg-destructive/10 p-3 text-destructive"><AlertTriangle size={21} /></div>
    <p className="max-w-sm text-sm text-foreground">{message}</p>
    {onRetry && <button type="button" onClick={onRetry} className="button-secondary" data-testid="button-retry"><RefreshCw size={15} /> Try again</button>}
  </div>;
}

function EmptyState({ title, description, icon: Icon = ShieldQuestion }: { title: string; description: string; icon?: typeof ShieldQuestion }) {
  return <div className="flex min-h-[250px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center" data-testid="state-empty">
    <div className="mb-4 rounded-2xl bg-secondary p-4 text-primary"><Icon size={25} /></div>
    <h3 className="font-display text-lg font-semibold">{title}</h3>
    <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
  </div>;
}

function Logo({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`group flex items-center gap-2.5 ${light ? 'text-white' : 'text-foreground'}`} data-testid="link-logo">
    <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform duration-300 group-hover:rotate-6">
      <Shield size={19} strokeWidth={2.5} /><span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-accent" />
    </span>
    <span className="font-display text-[17px] font-bold tracking-tight">PhishGuard <span className={light ? 'text-primary' : 'text-primary'}>AI</span></span>
  </Link>;
}

function StatusPill({ classification, label }: { classification?: string; label?: string }) {
  const value = classification ?? '';
  const isSafe = value === 'safe' || value === 'positive' || value === 'healthy';
  const isHigh = value === 'high-risk' || value === 'danger' || value === 'error';
  return <span className={`status-pill ${isSafe ? 'status-safe' : isHigh ? 'status-danger' : 'status-caution'}`} data-testid={`status-${value || 'unknown'}`}>
    {isSafe ? <CheckCircle2 size={13} /> : isHigh ? <XCircle size={13} /> : <AlertTriangle size={13} />} {label ?? value.replace('-', ' ')}
  </span>;
}

function formatDate(value?: string) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function RiskMeter({ score, large = false }: { score: number; large?: boolean }) {
  const tone = score >= 70 ? 'bg-destructive' : score >= 40 ? 'bg-accent' : 'bg-primary';
  return <div className="flex items-center gap-3" data-testid="meter-risk-score">
    <div className={`risk-track ${large ? 'h-3' : 'h-2'}`}><div className={`h-full rounded-full ${tone} transition-all duration-700`} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} /></div>
    <span className={`font-mono font-medium ${large ? 'text-lg' : 'text-xs'}`}>{score.toFixed(1)}</span>
  </div>;
}

function ScanRow({ scan, onDelete }: { scan: Scan; onDelete?: (id: string) => void }) {
  return <div className="grid gap-4 border-b border-border/70 px-5 py-4 transition-colors last:border-0 hover:bg-secondary/40 md:grid-cols-[minmax(0,1fr)_130px_110px_40px] md:items-center" data-testid={`row-scan-${scan.id}`}>
    <div className="min-w-0">
      <p className="truncate font-mono text-sm text-foreground" title={scan.url} data-testid={`text-url-${scan.id}`}>{scan.url}</p>
      <p className="mt-1 text-xs text-muted-foreground">{formatDate(scan.createdAt)} · {scan.prediction}</p>
    </div>
    <StatusPill classification={scan.classification} />
    <RiskMeter score={scan.riskScore} />
    {onDelete ? <button type="button" onClick={() => onDelete(scan.id)} className="icon-button text-muted-foreground hover:text-destructive" aria-label="Delete scan" data-testid={`button-delete-scan-${scan.id}`}><Trash2 size={16} /></button> : <span />}
  </div>;
}

function Shell({ children, user }: { children: ReactNode; user?: User | null }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const logout = useLogout();
  const queryClient = useQueryClient();
  const isActive = (href: string) => location === href;
  const doLogout = () => logout.mutate(undefined, { onSuccess: () => { queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() }); setLocation('/'); } });
  return <div className="noise min-h-[100dvh] bg-background">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-8 px-2"><Logo light /></div>
      <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-sidebar-foreground/45">Workspace</p>
      <nav className="space-y-1" aria-label="Primary navigation">
        {navItems.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`sidebar-link ${isActive(item.href) ? 'sidebar-link-active' : ''}`} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} /><span>{item.label}</span>{isActive(item.href) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}</Link>; })}
      </nav>
      <div className="mt-auto">
        <div className="mb-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/50 p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium"><span className="h-2 w-2 animate-pulse-soft rounded-full bg-sidebar-primary" /> Analysis engine online</div>
          <p className="mt-2 text-[11px] leading-5 text-sidebar-foreground/55">URLs are analyzed without opening them.</p>
        </div>
        <Link href="/profile" className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-sidebar-accent" data-testid="link-profile-sidebar">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-sidebar-primary font-display text-xs font-bold text-sidebar-primary-foreground">{user?.name?.slice(0, 1).toUpperCase() ?? 'P'}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{user?.name ?? 'Your profile'}</span><span className="block truncate text-[11px] text-sidebar-foreground/50">{user?.email ?? 'Account settings'}</span></span>
        </Link>
        <button type="button" onClick={doLogout} className="sidebar-link mt-1 w-full text-sidebar-foreground/55 hover:text-sidebar-foreground" data-testid="button-logout"><LogOut size={16} /> Sign out</button>
      </div>
    </aside>
    {mobileOpen && <button type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-sidebar/40 md:hidden" data-testid="button-close-menu" />}
    <div className="md:pl-[264px]">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/85 px-5 backdrop-blur-xl md:px-10">
        <button type="button" onClick={() => setMobileOpen(true)} className="icon-button md:hidden" data-testid="button-open-menu"><Menu size={19} /></button>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Private workspace</div>
        <div className="ml-auto flex items-center gap-2"><Link href="/analyze" className="button-primary h-10 px-4 text-xs" data-testid="link-header-analyze"><Radar size={15} /> New analysis</Link></div>
      </header>
      <main className="mx-auto max-w-[1400px] px-5 py-8 md:px-10 md:py-10">{children}</main>
    </div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
    <div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>{action}
  </div>;
}

function Landing() {
  return <div className="min-h-[100dvh] overflow-hidden bg-background">
    <header className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8 md:py-7"><Logo /><nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex"><a href="#how-it-works" className="transition-colors hover:text-foreground" data-testid="link-how-it-works">How it works</a><a href="#why" className="transition-colors hover:text-foreground" data-testid="link-why">Why PhishGuard</a><Link href="/learn" className="transition-colors hover:text-foreground" data-testid="link-learning">Learning center</Link></nav><div className="flex items-center gap-2"><Link href="/login" className="button-ghost hidden sm:inline-flex" data-testid="link-login">Log in</Link><Link href="/register" className="button-primary" data-testid="link-get-started">Get started <ArrowRight size={15} /></Link></div></header>
    <section className="relative overflow-hidden px-5 pb-20 pt-36 md:px-8 md:pb-32 md:pt-48">
      <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-primary/10 blur-3xl" /><div className="absolute -left-56 bottom-0 h-[380px] w-[380px] rounded-full bg-accent/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.02fr_.98fr]">
        <div className="animate-rise"><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5 text-xs font-semibold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Explainable security for everyday links</div><h1 className="max-w-3xl font-display text-5xl font-bold leading-[1.02] tracking-[-.045em] md:text-7xl">Know what a link is <span className="text-primary">really asking.</span></h1><p className="mt-7 max-w-xl text-base leading-8 text-muted-foreground md:text-lg">PhishGuard AI checks suspicious URLs without opening them, then shows the signals behind its verdict. Less guessing. Better instincts.</p><div className="mt-9 flex flex-wrap gap-3"><Link href="/analyze" className="button-primary h-12 px-5" data-testid="link-hero-analyze"><Radar size={17} /> Analyze a URL <ArrowRight size={16} /></Link><Link href="/learn" className="button-secondary h-12 px-5" data-testid="link-hero-learn">Build your radar <BookOpen size={16} /></Link></div><div className="mt-8 flex items-center gap-4 text-xs text-muted-foreground"><div className="flex -space-x-2"><span className="avatar bg-primary/20 text-primary">A</span><span className="avatar bg-accent/30 text-accent-foreground">M</span><span className="avatar bg-secondary text-primary">J</span></div><span>Made for curious, careful humans.</span></div></div>
        <div className="relative animate-rise [animation-delay:120ms]"><div className="absolute -inset-4 rounded-[2rem] border border-primary/15 bg-primary/5 blur-[1px]" /><div className="relative overflow-hidden rounded-[1.6rem] border border-border bg-card p-5 shadow-2xl shadow-primary/10 md:p-7"><div className="mb-6 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.17em] text-muted-foreground"><span className="grid h-7 w-7 place-items-center rounded-lg bg-secondary text-primary"><Shield size={14} /></span> Live reasoning</div><span className="font-mono text-[10px] text-muted-foreground">PG / 04:28:19</span></div><div className="rounded-xl border border-border bg-background p-4"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"><Link2 size={12} /> inspected URL</div><p className="break-all font-mono text-sm leading-6 text-foreground">secure-payments-verification.co/account</p></div><div className="mt-5 grid grid-cols-[104px_1fr] items-center gap-5"><div className="relative grid aspect-square place-items-center rounded-full border-[9px] border-destructive/15"><div className="absolute inset-0 rounded-full border-[9px] border-transparent border-l-destructive border-t-destructive -rotate-45" /><div className="text-center"><span className="font-display text-3xl font-bold">82</span><span className="block text-[10px] uppercase tracking-wider text-muted-foreground">risk score</span></div></div><div><StatusPill classification="high-risk" label="High risk" /><p className="mt-3 text-sm font-semibold">Impersonation patterns detected</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The domain uses urgency language and a lookalike payment brand.</p></div></div><div className="mt-6 space-y-2.5"><div className="reason-row"><span className="reason-dot bg-destructive" /><span>Brand name appears in an untrusted domain</span><strong>+28</strong></div><div className="reason-row"><span className="reason-dot bg-accent" /><span>Unusual path requests account action</span><strong>+19</strong></div><div className="reason-row"><span className="reason-dot bg-primary" /><span>HTTPS encryption is present</span><strong>−5</strong></div></div><div className="mt-6 flex items-center gap-2 rounded-xl bg-secondary px-3.5 py-3 text-xs leading-5 text-secondary-foreground"><ShieldCheck size={16} className="shrink-0 text-primary" /> Verdicts are explanations, not black boxes.</div></div></div>
      </div>
    </section>
    <section id="how-it-works" className="border-y border-border bg-card/55 px-5 py-20 md:px-8 md:py-28"><div className="mx-auto max-w-7xl"><div className="max-w-2xl"><p className="eyebrow">A calmer way to check</p><h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-5xl">Pause. Inspect. Decide.</h2><p className="mt-4 leading-7 text-muted-foreground">The product is designed for the five seconds between doubt and a click.</p></div><div className="mt-12 grid gap-4 md:grid-cols-3"><Step n="01" icon={Link2} title="Paste the link" text="Bring the URL here instead of opening it in a browser." /><Step n="02" icon={Gauge} title="See the signals" text="A risk score is paired with the exact features that shaped it." /><Step n="03" icon={CheckCircle2} title="Choose with context" text="Get a clear recommendation, then build the instinct to spot it next time." /></div></div></section>
    <section id="why" className="surface-grid px-5 py-20 md:px-8 md:py-28"><div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow">Not just a warning</p><h2 className="mt-3 max-w-md font-display text-3xl font-bold tracking-tight md:text-5xl">Security tools should teach, not scare.</h2><p className="mt-5 max-w-md leading-7 text-muted-foreground">Every analysis becomes a tiny lesson in domain hygiene, social engineering, and safer decisions.</p><Link href="/register" className="button-primary mt-8" data-testid="link-why-start">Start learning safely <ArrowRight size={15} /></Link></div><div className="grid gap-4 sm:grid-cols-2"><FeatureCard icon={LockKeyhole} title="No accidental visits" text="Analyze the text of a URL without navigating to the destination." /><FeatureCard icon={CircleHelp} title="Reasoning you can read" text="Understand positive and risk indicators instead of trusting a mystery badge." /><FeatureCard icon={TrendingUp} title="A personal signal" text="Track your scan patterns and see where your security instincts improve." /><FeatureCard icon={Users} title="Built for real life" text="For inboxes, DMs, invoices, delivery texts, and every urgent little link." /></div></div></section>
    <footer className="border-t border-border px-5 py-8 md:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-xs text-muted-foreground sm:flex-row sm:items-center"><Logo /><span>Understand first. Click second.</span></div></footer>
  </div>;
}

function Step({ n, icon: Icon, title, text }: { n: string; icon: typeof Link2; title: string; text: string }) {
  return <div className="card group p-6"><div className="flex items-center justify-between"><span className="font-mono text-xs text-primary">{n}</span><span className="rounded-xl bg-secondary p-2.5 text-primary transition-transform duration-300 group-hover:rotate-6"><Icon size={18} /></span></div><h3 className="mt-10 font-display text-xl font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>;
}

function FeatureCard({ icon: Icon, title, text }: { icon: typeof LockKeyhole; title: string; text: string }) {
  return <div className="card p-6"><div className="mb-8 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon size={19} /></div><h3 className="font-display text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>;
}

function AuthLayout({ children, mode }: { children: ReactNode; mode: 'login' | 'register' }) {
  return <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[.88fr_1.12fr]"><div className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col"><Logo light /><div className="relative z-10 mt-auto max-w-lg pb-12"><div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-sidebar-primary"><ShieldCheck size={15} /> A clearer signal</div><h1 className="font-display text-5xl font-bold leading-[1.05]">Your next good decision can start with a pause.</h1><p className="mt-6 max-w-md leading-7 text-sidebar-foreground/65">PhishGuard gives you the language and evidence to handle suspicious links with confidence.</p><div className="mt-12 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/45 p-4"><p className="font-display text-2xl font-bold text-sidebar-primary">01</p><p className="mt-2 text-xs leading-5 text-sidebar-foreground/65">Inspect without opening</p></div><div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/45 p-4"><p className="font-display text-2xl font-bold text-accent">02</p><p className="mt-2 text-xs leading-5 text-sidebar-foreground/65">Learn from the result</p></div></div></div><div className="absolute -bottom-40 -right-20 h-[480px] w-[480px] rounded-full border border-sidebar-primary/20" /><div className="absolute -bottom-24 -right-4 h-[280px] w-[280px] rounded-full border border-sidebar-primary/10" /></div><div className="flex flex-col px-5 py-6 md:px-10 lg:px-20"><div className="flex items-center justify-between lg:justify-end"><div className="lg:hidden"><Logo /></div><span className="text-sm text-muted-foreground">{mode === 'login' ? 'New here?' : 'Already have an account?'} <Link href={mode === 'login' ? '/register' : '/login'} className="ml-1 font-semibold text-primary hover:underline" data-testid={`link-auth-switch-${mode}`}>{mode === 'login' ? 'Create account' : 'Log in'}</Link></span></div><div className="mx-auto flex w-full max-w-[460px] flex-1 items-center py-12">{children}</div></div></div>;
}

function Login() {
  const [, setLocation] = useLocation();
  const login = useLogin();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); login.mutate({ data: { email, password } }, { onSuccess: () => setLocation('/dashboard') }); };
  return <AuthLayout mode="login"><div className="w-full animate-rise"><p className="eyebrow">Welcome back</p><h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Sign in to your guardrail.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Your scans and learning progress are waiting.</p><form className="mt-9 space-y-5" onSubmit={submit}><Field label="Email address"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input" data-testid="input-email" /></Field><Field label="Password"><input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="input" data-testid="input-password" /></Field>{login.isError && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-login-error">That login did not work. Check your details and try again.</p>}<button type="submit" disabled={login.isPending} className="button-primary h-12 w-full" data-testid="button-submit-login">{login.isPending ? 'Checking credentials…' : <><LogIn size={16} /> Log in</>}</button></form><p className="mt-8 text-center text-xs leading-5 text-muted-foreground">By continuing, you agree to use PhishGuard for safer decisions—not for opening links on your behalf.</p></div></AuthLayout>;
}

function Register() {
  const [, setLocation] = useLocation();
  const register = useRegister();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); register.mutate({ data: { name, email, password } }, { onSuccess: () => setLocation('/dashboard') }); };
  return <AuthLayout mode="register"><div className="w-full animate-rise"><p className="eyebrow">Start with a signal</p><h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Build better link instincts.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Create your private workspace. No judgment, just clearer explanations.</p><form className="mt-9 space-y-5" onSubmit={submit}><Field label="Your name"><input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" className="input" data-testid="input-name" /></Field><Field label="Email address"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input" data-testid="input-register-email" /></Field><Field label="Password"><input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="input" data-testid="input-register-password" /></Field>{register.isError && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-register-error">We could not create the account. Try another email.</p>}<button type="submit" disabled={register.isPending} className="button-primary h-12 w-full" data-testid="button-submit-register">{register.isPending ? 'Creating your workspace…' : <><ShieldCheck size={16} /> Create account</>}</button></form></div></AuthLayout>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</span>{children}</label>;
}

function DashboardPage() {
  const dashboard = useGetDashboard();
  const { data, isLoading, isError, refetch } = dashboard;
  const user = useCurrentUserValue();
  if (isLoading) return <Shell user={user}><PageHeading eyebrow="Your workspace" title="Your security pulse" description="A quick read on the links you have checked and the signals worth noticing." /><LoadingState /></Shell>;
  if (isError || !data) return <Shell user={user}><PageHeading eyebrow="Your workspace" title="Your security pulse" description="A quick read on the links you have checked and the signals worth noticing." /><ErrorState onRetry={() => refetch()} /></Shell>;
  return <Shell user={user}><PageHeading eyebrow={`Good to see you${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`} title="Your security pulse" description="A quick read on the links you have checked and the signals worth noticing." action={<Link href="/analyze" className="button-primary" data-testid="link-dashboard-analyze"><Radar size={16} /> Check a link</Link>} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total scans" value={data.totalScans} icon={Radar} note="All time" /><Metric label="Safe links" value={data.safeCount} icon={ShieldCheck} tone="safe" note={data.totalScans ? `${Math.round(data.safeCount / data.totalScans * 100)}% of scans` : 'Build your baseline'} /><Metric label="Needs a look" value={data.suspiciousCount} icon={AlertTriangle} tone="caution" note="Suspicious" /><Metric label="High risk" value={data.highRiskCount} icon={XCircle} tone="danger" note="Do not open" /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_.7fr]"><section className="card overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-5"><div><h2 className="font-display text-lg font-semibold">Recent scans</h2><p className="mt-1 text-xs text-muted-foreground">Your latest URL checks</p></div><Link href="/history" className="text-xs font-semibold text-primary hover:underline" data-testid="link-view-history">View history <ArrowRight className="ml-1 inline" size={13} /></Link></div>{data.recentScans?.length ? data.recentScans.slice(0, 5).map((scan) => <ScanRow key={scan.id} scan={scan} />) : <EmptyState title="No scans yet" description="Paste your first suspicious link into the analyzer and your signal history will start here." icon={Link2} />}</section><section className="card p-6"><div className="flex items-start justify-between"><div><p className="eyebrow">Model status</p><h2 className="mt-2 font-display text-2xl font-bold">{data.averageRiskScore.toFixed(1)}</h2><p className="mt-1 text-xs text-muted-foreground">average risk score</p></div><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Gauge size={18} /></span></div><div className="mt-6"><RiskMeter score={data.averageRiskScore} large /></div><div className="mt-7 flex items-center justify-between border-t border-border pt-5 text-xs"><span className="text-muted-foreground">Analysis engine</span><StatusPill classification="healthy" label={data.modelStatus || 'Operational'} /></div><p className="mt-5 text-sm leading-6 text-muted-foreground">Use your average as a personal baseline. A score is a signal to investigate, never a reason to panic.</p></section></div><section className="mt-6 card p-6"><div className="flex items-end justify-between"><div><p className="eyebrow">Activity rhythm</p><h2 className="mt-2 font-display text-lg font-semibold">Risk across recent activity</h2></div><span className="font-mono text-xs text-muted-foreground">scans / risk</span></div>{data.activity?.length ? <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">{data.activity.map((item, index) => <div key={`${item.label}-${index}`} className="text-center" data-testid={`activity-${index}`}><div className="mx-auto flex h-32 items-end justify-center gap-1.5 rounded-xl bg-secondary/65 px-3 pb-3">{[item.scans, item.risk].map((value, i) => <div key={i} className={`w-3 rounded-t-md ${i ? 'bg-accent/70' : 'bg-primary'}`} style={{ height: `${Math.max(12, Math.min(100, value))}%` }} />)}</div><p className="mt-3 truncate text-[11px] text-muted-foreground">{item.label}</p></div>)}</div> : <p className="mt-5 text-sm text-muted-foreground">More activity will appear after your first scans.</p>}</section></Shell>;
}

function Metric({ label, value, icon: Icon, tone = 'default', note }: { label: string; value: number; icon: typeof Radar; tone?: string; note: string }) {
  return <div className="card p-5 transition-transform duration-300 hover:-translate-y-0.5"><div className="flex items-start justify-between"><p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</p><span className={`rounded-xl p-2 ${tone === 'danger' ? 'bg-destructive/10 text-destructive' : tone === 'caution' ? 'bg-accent/20 text-accent-foreground' : tone === 'safe' ? 'bg-primary/10 text-primary' : 'bg-secondary text-primary'}`}><Icon size={17} /></span></div><p className="mt-6 font-display text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>;
}

function AnalyzerPage() {
  const [url, setUrl] = useState(''); const [result, setResult] = useState<Scan | null>(null);
  const analyze = useAnalyzeUrl(); const user = useCurrentUserValue();
  const submit = (event: FormEvent) => { event.preventDefault(); if (url.trim()) analyze.mutate({ data: { url: url.trim() } }, { onSuccess: (scan) => setResult(scan) }); };
  return <Shell user={user}><PageHeading eyebrow="Safe inspection" title="Analyze a suspicious URL" description="Paste the link as text. PhishGuard will inspect its signals without visiting the destination." /><div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]"><section className="card surface-grid p-6 md:p-8"><div className="mb-8 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground"><Radar size={21} /></span><div><h2 className="font-display text-xl font-semibold">Start with the full link</h2><p className="text-sm text-muted-foreground">Include https:// when possible.</p></div></div><form onSubmit={submit}><label className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground" htmlFor="analyze-url">URL to inspect</label><textarea id="analyze-url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2048} rows={5} placeholder="https://example.com/account/verify" className="input mt-2 min-h-[145px] resize-none font-mono text-sm leading-6" data-testid="input-analyze-url" /><div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><LockKeyhole size={13} /> Never opened by PhishGuard</span><span>{url.length}/2048</span></div>{analyze.isError && <p className="mt-4 flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive" data-testid="text-analyze-error"><AlertTriangle size={15} /> We could not analyze that URL. Check it and try again.</p>}<button type="submit" disabled={analyze.isPending || !url.trim()} className="button-primary mt-6 h-12 w-full" data-testid="button-analyze-url">{analyze.isPending ? <><span className="animate-pulse">Reading URL signals…</span></> : <><Send size={16} /> Analyze safely</>}</button></form><div className="mt-8 border-t border-border pt-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Helpful habit</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Do not copy a link by opening it first. Long-press or right-click, then copy the address.</p></div></section><ResultPanel result={result} loading={analyze.isPending} /></div></Shell>;
}

function ResultPanel({ result, loading }: { result: Scan | null; loading?: boolean }) {
  if (loading) return <LoadingState message="Comparing domain, path, and language signals…" />;
  if (!result) return <div className="flex min-h-[440px] flex-col justify-center rounded-3xl border border-dashed border-border bg-card/60 p-8 md:p-12" data-testid="state-analyzer-empty"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><ShieldQuestion size={27} /></div><h2 className="mt-7 font-display text-2xl font-semibold">Your explanation will appear here</h2><p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">Run a scan to see the verdict, confidence signals, and a recommendation you can act on.</p><div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3"><div className="mini-feature"><Gauge size={15} /> Risk score</div><div className="mini-feature"><CircleHelp size={15} /> Plain reasoning</div><div className="mini-feature"><ShieldCheck size={15} /> Next step</div></div></div>;
  return <div className="card animate-rise overflow-hidden" data-testid="panel-scan-result"><div className="border-b border-border bg-secondary/50 p-6 md:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Latest result</p><div className="mt-2 flex items-center gap-3"><StatusPill classification={result.classification} /><span className="text-xs text-muted-foreground">{formatDate(result.createdAt)}</span></div></div><div className="text-right"><p className="font-mono text-4xl font-medium">{result.riskScore.toFixed(1)}</p><p className="text-[10px] uppercase tracking-[.14em] text-muted-foreground">risk score</p></div></div><p className="mt-6 break-all font-mono text-sm leading-6">{result.url}</p></div><div className="p-6 md:p-8"><h3 className="font-display text-xl font-semibold">{result.prediction}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{result.recommendation}</p><div className="mt-7"><div className="mb-3 flex justify-between text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground"><span>Signal breakdown</span><span>{result.riskLevel}</span></div><RiskMeter score={result.riskScore} large /></div><div className="mt-8 grid gap-7 md:grid-cols-2">{result.positiveIndicators?.length > 0 && <IndicatorList title="Positive indicators" items={result.positiveIndicators} positive />}{result.riskIndicators?.length > 0 && <IndicatorList title="Risk indicators" items={result.riskIndicators} />}</div>{result.features?.length > 0 && <div className="mt-8 border-t border-border pt-7"><p className="eyebrow">What the model saw</p><div className="mt-4 grid gap-2">{result.features.map((feature, index) => <div key={`${feature.label}-${index}`} className="feature-line" data-testid={`feature-${index}`}><span className={`h-2 w-2 rounded-full ${feature.status === 'positive' ? 'bg-primary' : feature.status === 'danger' ? 'bg-destructive' : 'bg-accent'}`} /><span className="font-medium">{feature.label}</span><span className="ml-auto text-right text-xs text-muted-foreground">{feature.value}</span></div>)}</div></div>}</div></div>;
}

function IndicatorList({ title, items, positive = false }: { title: string; items: string[]; positive?: boolean }) {
  return <div><p className={`mb-3 text-xs font-semibold uppercase tracking-[.12em] ${positive ? 'text-primary' : 'text-destructive'}`}>{title}</p><ul className="space-y-3">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-sm leading-5 text-muted-foreground"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${positive ? 'bg-primary' : 'bg-destructive'}`} />{item}</li>)}</ul></div>;
}

function HistoryPage() {
  const [search, setSearch] = useState(''); const [classification, setClassification] = useState<'all' | 'safe' | 'suspicious' | 'high-risk'>('all');
  const params = useMemo(() => ({ q: search || undefined, classification }), [search, classification]);
  const scans = useListScans(params); const remove = useDeleteScan(); const user = useCurrentUserValue();
  const deleteItem = (id: string) => { if (window.confirm('Remove this scan from your history?')) remove.mutate({ params: { id } }); };
  return <Shell user={user}><PageHeading eyebrow="Your trail of evidence" title="Scan history" description="Search your past checks, revisit the reasoning, and keep your own signal library tidy." /><section className="card overflow-hidden"><div className="flex flex-col gap-4 border-b border-border p-5 md:flex-row md:items-center"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search URLs…" className="input h-11 pl-10" data-testid="input-search-history" /></div><div className="flex gap-1 overflow-x-auto rounded-xl bg-secondary p-1">{(['all', 'safe', 'suspicious', 'high-risk'] as const).map((filter) => <button type="button" key={filter} onClick={() => setClassification(filter)} className={`filter-button ${classification === filter ? 'filter-button-active' : ''}`} data-testid={`button-filter-${filter}`}>{filter === 'all' ? 'All scans' : filter.replace('-', ' ')}</button>)}</div></div>{scans.isLoading ? <LoadingState message="Loading your scan history…" /> : scans.isError ? <div className="p-5"><ErrorState onRetry={() => scans.refetch()} /></div> : scans.data?.length ? <div>{scans.data.map((scan) => <ScanRow key={scan.id} scan={scan} onDelete={deleteItem} />)}</div> : <EmptyState title="No matching scans" description={search ? 'Try a different URL or clear the search.' : 'Your completed URL analyses will live here.'} icon={History} />}</section></Shell>;
}

function SimulatorPage() {
  const analyze = useAnalyzeUrl(); const [first, setFirst] = useState('https://accounts.google.com/signin'); const [second, setSecond] = useState('https://accounts-google-security.com/signin'); const [results, setResults] = useState<[Scan, Scan] | null>(null); const user = useCurrentUserValue();
  const compare = async (event: FormEvent) => { event.preventDefault(); if (!first.trim() || !second.trim()) return; try { const values = await Promise.all([analyze.mutateAsync({ data: { url: first.trim() } }), analyze.mutateAsync({ data: { url: second.trim() } })]); setResults(values); } catch { /* mutation state communicates the error */ } };
  return <Shell user={user}><PageHeading eyebrow="Practice without the pressure" title="What-if simulator" description="Put two URLs side by side and see how small changes can change the risk picture." /><form onSubmit={compare} className="grid gap-4 lg:grid-cols-2"><SimulatorInput label="A · the familiar-looking one" value={first} onChange={setFirst} /><SimulatorInput label="B · the lookalike" value={second} onChange={setSecond} /><div className="flex flex-wrap items-center gap-3 lg:col-span-2"><button type="submit" disabled={analyze.isPending} className="button-primary" data-testid="button-compare-urls"><Sparkles size={16} /> {analyze.isPending ? 'Comparing…' : 'Compare safely'}</button><span className="text-xs text-muted-foreground">Both links are sent for analysis without being opened.</span></div></form>{analyze.isError && <p className="mt-5 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-simulator-error">One of these URLs could not be analyzed. Try again.</p>}{results ? <div className="mt-7 grid gap-4 lg:grid-cols-2">{results.map((result, index) => <ResultPanel key={index} result={result} />)}</div> : <div className="mt-7 rounded-3xl border border-dashed border-border bg-card/50 p-8"><div className="grid max-w-2xl gap-5 md:grid-cols-3"><div><span className="step-number">1</span><h3 className="mt-3 font-display font-semibold">Notice the domain</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Brand words can appear in domains that are not owned by the brand.</p></div><div><span className="step-number">2</span><h3 className="mt-3 font-display font-semibold">Change one thing</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Test a real domain against a lookalike to surface the difference.</p></div><div><span className="step-number">3</span><h3 className="mt-3 font-display font-semibold">Read the why</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">The useful part is the reasoning, not just the label.</p></div></div></div>}</Shell>;
}

function SimulatorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="card p-5"><label className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</label><div className="relative mt-3"><Globe2 size={16} className="absolute left-3 top-3.5 text-muted-foreground" /><input required value={value} onChange={(e) => onChange(e.target.value)} className="input pl-10 font-mono text-sm" data-testid={`input-simulator-${label[0].toLowerCase()}`} /></div></div>;
}

const quizQuestions = [
  ['A message says your account closes in 10 minutes. What is the safest first move?', ['Click quickly to avoid the lockout', 'Pause and verify through a known channel', 'Reply asking if it is real'], 1],
  ['Which part of a URL tells you the registered domain?', ['The first words after https://', 'The last path segment', 'The domain immediately before the first slash'], 2],
  ['A padlock in the address bar proves a site is legitimate.', ['True', 'False', 'Only on mobile'], 1],
  ['What should you do with an unexpected invoice attachment?', ['Open it in preview', 'Verify the sender and context independently', 'Forward it to a colleague'], 1],
  ['Which is a common lookalike tactic?', ['A misspelled or extra domain word', 'A short email signature', 'A message sent during work hours'], 0],
  ['You receive a login code you did not request. What does it suggest?', ['Someone may be trying to access the account', 'The service is testing you', 'Codes are always harmless'], 0],
  ['What makes an urgent request more suspicious?', ['It asks you to bypass normal process', 'It contains your first name', 'It has a company logo'], 0],
  ['Where should you navigate to change a password?', ['The link in the message', 'A saved bookmark or typed official address', 'A search ad'], 1],
  ['A URL uses HTTPS, so it is safe to enter credentials.', ['True', 'False', 'Only if it loads quickly'], 1],
  ['What is the best response to a suspicious work message?', ['Delete it silently', 'Report it through your organization’s process', 'Test the link on a spare device'], 1],
];

function QuizPage() {
  const [current, setCurrent] = useState(0); const [answers, setAnswers] = useState<number[]>([]); const [submitted, setSubmitted] = useState(false); const [result, setResult] = useState<{ score: number; percentage: number } | null>(null); const submitQuiz = useSubmitQuiz(); const user = useCurrentUserValue();
  const choose = (answer: number) => { const next = [...answers]; next[current] = answer; setAnswers(next); };
  const finish = () => { const score = answers.reduce((total, answer, index) => total + (answer === Number(quizQuestions[index][2]) ? 1 : 0), 0); const percentage = Math.round(score / quizQuestions.length * 100); setResult({ score, percentage }); setSubmitted(true); submitQuiz.mutate({ data: { score, totalQuestions: quizQuestions.length, percentage } }); };
  const reset = () => { setCurrent(0); setAnswers([]); setResult(null); setSubmitted(false); };
  return <Shell user={user}><PageHeading eyebrow="Ten tiny decisions" title="Phishing awareness quiz" description="A short practice run for the moments when a message tries to rush you." />{submitted && result ? <section className="card mx-auto max-w-2xl animate-rise p-8 text-center md:p-12"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary"><GraduationCap size={30} /></div><p className="eyebrow mt-7">Your result</p><h2 className="mt-3 font-display text-5xl font-bold">{result.percentage}%</h2><p className="mt-3 text-muted-foreground">You got {result.score} of {quizQuestions.length} decisions right.</p><div className="mx-auto mt-7 max-w-md rounded-2xl bg-secondary p-4 text-left text-sm leading-6 text-secondary-foreground">{result.percentage >= 80 ? 'Strong instincts. Keep using that pause when a request feels urgent.' : 'Good start. Revisit the learning center and practice the signals that felt less certain.'}</div><button type="button" onClick={reset} className="button-primary mt-8" data-testid="button-retake-quiz"><RefreshCw size={15} /> Try again</button></section> : <section className="card mx-auto max-w-3xl overflow-hidden"><div className="flex items-center justify-between border-b border-border bg-secondary/50 px-5 py-4"><span className="text-xs font-semibold uppercase tracking-[.15em] text-muted-foreground">Question {current + 1} of {quizQuestions.length}</span><span className="font-mono text-xs text-primary">{Math.round((current) / quizQuestions.length * 100)}%</span></div><div className="p-6 md:p-10"><div className="mb-8 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(current + 1) / quizQuestions.length * 100}%` }} /></div><h2 className="font-display text-2xl font-semibold leading-tight md:text-3xl">{quizQuestions[current][0] as string}</h2><div className="mt-8 space-y-3">{(quizQuestions[current][1] as string[]).map((answer, index) => <button type="button" key={answer} onClick={() => choose(index)} className={`quiz-option ${answers[current] === index ? 'quiz-option-selected' : ''}`} data-testid={`button-answer-${index}`}><span className="grid h-7 w-7 place-items-center rounded-lg border border-current/20 font-mono text-xs">{String.fromCharCode(65 + index)}</span><span>{answer}</span>{answers[current] === index && <Check size={17} className="ml-auto" />}</button>)}</div><div className="mt-9 flex justify-between"><button type="button" disabled={current === 0} onClick={() => setCurrent((value) => value - 1)} className="button-secondary" data-testid="button-previous-question">Previous</button>{current < quizQuestions.length - 1 ? <button type="button" disabled={answers[current] === undefined} onClick={() => setCurrent((value) => value + 1)} className="button-primary" data-testid="button-next-question">Next <ArrowRight size={15} /></button> : <button type="button" disabled={answers[current] === undefined || submitQuiz.isPending} onClick={finish} className="button-primary" data-testid="button-submit-quiz">{submitQuiz.isPending ? 'Saving result…' : 'See my result'} <Check size={15} /></button>}</div></div></section>}</Shell>;
}

function LearnPage() {
  const [open, setOpen] = useState(0); const user = useCurrentUserValue();
  const lessons = [{ title: 'Read a URL like a human', kicker: '01 · Domains', icon: Globe2, body: 'Start at the registered domain—the part immediately before the first slash. Subdomains can sound official while pointing somewhere else. When in doubt, compare the domain to a bookmark or a known official address.', bullets: ['Look for misspellings, extra words, and unusual endings.', 'Do not treat a brand name anywhere in a URL as proof of ownership.'] }, { title: 'Spot the pressure pattern', kicker: '02 · Social engineering', icon: Zap, body: 'Phishing works by shrinking your thinking time. A deadline, threat, reward, or request for secrecy is not proof on its own, but it is a reason to slow down and verify the request out of band.', bullets: ['Urgency is a persuasion technique, not a security control.', 'Contact the person or company through a channel you already trust.'] }, { title: 'Make verification a habit', kicker: '03 · Response', icon: ShieldCheck, body: 'A safe response is often wonderfully boring: do not click, do not reply, and report the message. Navigate independently when you need to sign in or check an order.', bullets: ['Use a saved bookmark or type the official address yourself.', 'Report suspicious messages so others can be protected too.'] }];
  return <Shell user={user}><PageHeading eyebrow="Learning center" title="Build your signal library" description="Short, practical lessons for the patterns behind suspicious links and messages." /><div className="grid gap-4 lg:grid-cols-[.74fr_1.26fr]"><div className="space-y-3">{lessons.map((lesson, index) => { const Icon = lesson.icon; return <button type="button" key={lesson.title} onClick={() => setOpen(index)} className={`lesson-nav ${open === index ? 'lesson-nav-active' : ''}`} data-testid={`button-lesson-${index}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Icon size={18} /></span><span className="min-w-0 text-left"><span className="block text-[10px] font-semibold uppercase tracking-[.13em] text-muted-foreground">{lesson.kicker}</span><span className="mt-1 block font-display font-semibold">{lesson.title}</span></span><ChevronDown className={`ml-auto transition-transform ${open === index ? '-rotate-90' : ''}`} size={16} /></button>; })}</div><article className="card min-h-[390px] p-7 md:p-10"><div className="flex items-center gap-3 text-primary"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10">{(() => { const Icon = lessons[open].icon; return <Icon size={20} />; })()}</span><span className="eyebrow">{lessons[open].kicker}</span></div><h2 className="mt-8 max-w-xl font-display text-3xl font-bold tracking-tight">{lessons[open].title}</h2><p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground">{lessons[open].body}</p><ul className="mt-7 space-y-3">{lessons[open].bullets.map((bullet) => <li key={bullet} className="flex gap-3 text-sm leading-6"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-primary" />{bullet}</li>)}</ul></article></div></Shell>;
}

function BrowserProtectionPage() {
  const [notice, setNotice] = useState(false); const user = useCurrentUserValue();
  return <Shell user={user}><PageHeading eyebrow="A concept for your browser" title="A second set of eyes, right where you browse." description="The PhishGuard browser companion is designed to bring explainable checks closer to the moment of decision." action={<button type="button" onClick={() => setNotice(true)} className="button-primary" data-testid="button-extension-notify"><ShieldCheck size={16} /> {notice ? 'You’re on the list' : 'Join the preview'}</button>} /><div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]"><section className="card overflow-hidden"><div className="border-b border-border bg-sidebar px-5 py-3 text-sidebar-foreground"><div className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full bg-destructive" /><span className="h-2 w-2 rounded-full bg-accent" /><span className="h-2 w-2 rounded-full bg-primary" /><div className="ml-4 flex-1 rounded-lg bg-sidebar-accent px-3 py-2 font-mono text-[10px] text-sidebar-foreground/60">shop.example.com/checkout</div><Shield size={15} className="text-sidebar-primary" /></div></div><div className="surface-grid min-h-[340px] p-7 md:p-12"><div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl shadow-primary/10"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><Shield size={14} /></span> PhishGuard check</div><X size={15} className="text-muted-foreground" /></div><div className="mt-6 flex gap-3 rounded-xl bg-accent/15 p-3"><AlertTriangle size={17} className="shrink-0 text-accent-foreground" /><div><p className="text-sm font-semibold">This page deserves a pause</p><p className="mt-1 text-xs leading-5 text-muted-foreground">We found 2 signals worth checking before you continue.</p></div></div><div className="mt-4 space-y-2 text-xs"><div className="feature-line"><span className="h-2 w-2 rounded-full bg-destructive" /><span>Domain differs from saved merchant</span><span className="ml-auto text-destructive">Review</span></div><div className="feature-line"><span className="h-2 w-2 rounded-full bg-primary" /><span>Encrypted connection</span><span className="ml-auto text-primary">Good</span></div></div><button type="button" onClick={() => setNotice(true)} className="button-secondary mt-5 w-full text-xs" data-testid="button-extension-details">See why this appeared <ArrowRight size={14} /></button></div></div></section><section className="space-y-4"><div className="card p-6"><p className="eyebrow">Designed around trust</p><h2 className="mt-3 font-display text-2xl font-bold">Quiet when things look normal. Clear when they do not.</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">The concept keeps the full explanation one click away, without replacing your browser or making decisions for you.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><FeatureCard icon={LockKeyhole} title="Private by default" text="No page content is opened or shared as part of a URL check." /><FeatureCard icon={CircleHelp} title="Explainable alerts" text="See the signal, not just a frightening red screen." /></div></section></div></Shell>;
}

function ProfilePage() {
  const profile = useGetProfile(); const user = useCurrentUserValue(); const { data, isLoading, isError, refetch } = profile;
  return <Shell user={user}>{isLoading ? <LoadingState message="Loading your profile…" /> : isError || !data ? <ErrorState onRetry={() => refetch()} /> : <><PageHeading eyebrow="Your account" title="Personal profile" description="A small record of the work you have put into making safer calls." /><div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><section className="card p-7"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary font-display text-2xl font-bold text-primary-foreground">{data.name.slice(0, 1).toUpperCase()}</div><h2 className="mt-6 font-display text-2xl font-bold" data-testid="text-profile-name">{data.name}</h2><p className="mt-1 text-sm text-muted-foreground" data-testid="text-profile-email">{data.email}</p><div className="mt-8 border-t border-border pt-5 text-xs text-muted-foreground"><span className="flex items-center gap-2"><UserRound size={14} /> Member profile</span><span className="mt-3 flex items-center gap-2"><KeyRound size={14} /> Private scan history</span></div></section><section className="grid gap-4 sm:grid-cols-2"><Metric label="All scans" value={data.totalScans} icon={Radar} note="Total URL checks" /><Metric label="Safe" value={data.safeScans} icon={ShieldCheck} tone="safe" note="Clear signals" /><Metric label="Suspicious" value={data.suspiciousScans} icon={AlertTriangle} tone="caution" note="Worth reviewing" /><Metric label="High risk" value={data.highRiskScans} icon={XCircle} tone="danger" note="Avoid opening" /></section></div></>}</Shell>;
}

function AdminPage() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } }); const dashboard = useGetDashboard(); const user = useCurrentUserValue();
  return <Shell user={user}><PageHeading eyebrow="Operations view" title="Model performance" description="A transparent read on the analysis engine status and the signal volume in this workspace." /><div className="grid gap-4 md:grid-cols-3"><div className="card p-6"><p className="eyebrow">API health</p><div className="mt-4 flex items-center gap-3">{health.isLoading ? <span className="text-sm text-muted-foreground">Checking…</span> : health.isError ? <StatusPill classification="error" label="Unavailable" /> : <StatusPill classification="healthy" label={health.data?.status ?? 'Healthy'} />}</div></div><div className="card p-6"><p className="eyebrow">Scans evaluated</p><p className="mt-3 font-display text-3xl font-bold">{dashboard.data?.totalScans ?? '—'}</p><p className="mt-1 text-xs text-muted-foreground">Across your workspace</p></div><div className="card p-6"><p className="eyebrow">Average risk</p><p className="mt-3 font-display text-3xl font-bold">{dashboard.data ? dashboard.data.averageRiskScore.toFixed(1) : '—'}</p><p className="mt-1 text-xs text-muted-foreground">Current scan baseline</p></div></div><section className="card mt-6 p-7 md:p-9"><div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between"><div><p className="eyebrow">How to read this screen</p><h2 className="mt-3 font-display text-2xl font-bold">Performance is more than a single number.</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">PhishGuard surfaces the model’s signals so people can challenge a result, understand uncertainty, and make a safer choice. This view connects system availability with the scan patterns in your workspace.</p></div><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Gauge size={25} /></div></div><div className="mt-8 grid gap-3 md:grid-cols-3"><div className="rounded-2xl bg-secondary p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Availability</p><p className="mt-3 text-sm leading-6">Is the analysis service reachable and returning a current health signal?</p></div><div className="rounded-2xl bg-secondary p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coverage</p><p className="mt-3 text-sm leading-6">Are enough links being checked to make your personal baseline meaningful?</p></div><div className="rounded-2xl bg-secondary p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Explainability</p><p className="mt-3 text-sm leading-6">Can each result be understood without trusting a black-box warning?</p></div></div></section></Shell>;
}

function useCurrentUserValue() {
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });
  return current.data?.user ?? null;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Landing} /><Route path="/login" component={Login} /><Route path="/register" component={Register} /><Route path="/dashboard" component={DashboardPage} /><Route path="/analyze" component={AnalyzerPage} /><Route path="/history" component={HistoryPage} /><Route path="/simulator" component={SimulatorPage} /><Route path="/quiz" component={QuizPage} /><Route path="/learn" component={LearnPage} /><Route path="/browser-protection" component={BrowserProtectionPage} /><Route path="/profile" component={ProfilePage} /><Route path="/admin" component={AdminPage} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
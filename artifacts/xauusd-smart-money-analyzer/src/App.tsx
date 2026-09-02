import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type MarketBridge, useGetMarketBridge } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CandlestickChart,
  ChevronDown,
  CircleHelp,
  Clock3,
  Database,
  Gauge,
  Layers3,
  Menu,
  Newspaper,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

type Bias = 'Bullish' | 'Bearish' | 'Neutral';

const biasData: { timeframe: string; bias: Bias; structure: string; bos: string; confidence: number }[] = [
  { timeframe: '4H', bias: 'Bullish', structure: 'Expansion', bos: 'BOS ↑ 2,342.8', confidence: 78 },
  { timeframe: '1H', bias: 'Bullish', structure: 'Higher high', bos: 'BOS ↑ 2,342.8', confidence: 73 },
  { timeframe: '15m', bias: 'Neutral', structure: 'Range delivery', bos: 'No break', confidence: 54 },
  { timeframe: '5m', bias: 'Bearish', structure: 'Retracement', bos: 'CHoCH ↓ 2,337.1', confidence: 61 },
];

const scenarios = [
  {
    id: 'primary',
    label: 'Primary',
    direction: 'BUY',
    title: 'OB + FVG after SSL sweep',
    trigger: '5m displacement closes above 2,344.90 after SSL is swept.',
    invalidation: '5m close below 2,336.40 or bearish CHoCH.',
    target: 'TP1 2,352.80 · hold for BSL 2,361.20',
    logic: 'Long wick OB + BOS + volume expansion.',
    confidence: 78,
  },
  {
    id: 'secondary',
    label: 'Secondary',
    direction: 'SELL',
    title: 'Bearish OB at BSL',
    trigger: 'Price reaches 2,347.90 BSL without a confirming sweep.',
    invalidation: 'Acceptance above 2,350.20 with bullish displacement.',
    target: 'TP1 2,341.65 · rebalance into 2,336.70 FVG',
    logic: 'Fade liquidity draw only with rejection.',
    confidence: 57,
  },
  {
    id: 'wait',
    label: 'Tertiary',
    direction: 'WAIT',
    title: 'Decision zone conflict',
    trigger: 'Price remains between the live line and unmitigated zones.',
    invalidation: 'Wait state clears on displacement plus a 5m close.',
    target: 'No target · preserve capital until intent is visible.',
    logic: 'News window is too close for a clean asymmetry.',
    confidence: 64,
  },
];

const candleData = [
  [42, 64, 34, 73, 0], [48, 59, 39, 68, 1], [54, 67, 43, 77, 0], [62, 72, 53, 81, 1],
  [70, 76, 57, 88, 0], [65, 69, 51, 75, 1], [72, 81, 64, 91, 0], [79, 83, 68, 89, 0],
  [83, 78, 73, 94, 1], [77, 69, 63, 82, 1], [69, 60, 56, 76, 1], [61, 66, 52, 72, 0],
  [66, 73, 61, 80, 0], [73, 71, 67, 84, 1], [71, 62, 55, 76, 1], [63, 58, 49, 70, 1],
  [57, 64, 53, 69, 0], [63, 75, 59, 81, 0], [72, 79, 67, 86, 0], [78, 85, 73, 91, 0],
  [84, 87, 79, 94, 0], [88, 82, 76, 91, 1], [82, 73, 67, 87, 1], [73, 77, 68, 82, 0],
  [77, 83, 71, 88, 0], [83, 79, 74, 91, 1], [79, 72, 66, 84, 1], [72, 68, 60, 78, 1],
  [68, 74, 65, 80, 0], [74, 81, 70, 87, 0], [81, 86, 77, 92, 0], [86, 82, 75, 90, 1],
];

function formatPrice(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

function formatNumber(value: number | null | undefined, digits = 0) {
  return typeof value === 'number' ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : 'Unavailable';
}

function Header({ live, onToggle, onRefresh, refreshing }: { live: boolean; onToggle: () => void; onRefresh: () => void; refreshing: boolean }) {
  return (
    <header className="topbar">
      <div className="crumb">
        <button className="mobile-menu" data-testid="button-open-mobile-menu" aria-label="Open navigation"><Menu size={17} /></button>
        <span>Workspace</span><span className="crumb-sep">/</span><strong>Market command center</strong>
      </div>
      <div className="top-actions">
        <button className={`feed-toggle ${live ? 'live' : ''}`} onClick={onToggle} data-testid="button-toggle-data-feed">
          {live ? <Wifi size={13} /> : <WifiOff size={13} />}<span>{live ? 'Live feed' : 'Feed paused'}</span><i className="toggle-track" />
        </button>
        <button className="icon-button" data-testid="button-search" aria-label="Search"><Search size={16} /></button>
        <button className="icon-button" data-testid="button-notifications" aria-label="Notifications"><Bell size={16} /></button>
        <div className="profile-chip"><div className="avatar">AR</div><div><span className="profile-name">Alex Rivera</span><span className="profile-role">Market analyst</span></div><ChevronDown size={13} /></div>
      </div>
    </header>
  );
}

function Sidebar({ active, onNavigate }: { active: string; onNavigate: (item: string) => void }) {
  const nav = [
    { label: 'Overview', icon: BarChart3 },
    { label: 'Market structure', icon: CandlestickChart },
    { label: 'Liquidity map', icon: Layers3 },
    { label: 'Trade journal', icon: BookOpen },
  ];
  return (
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">X</div><div><div className="brand-name">Aurum Desk</div><span className="brand-sub">Smart money analyzer</span></div></div>
      <div className="nav-label">Analysis desk</div>
      <nav className="nav-group">
        {nav.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => onNavigate(label)} data-testid={`button-nav-${label.toLowerCase().replace(' ', '-')}`}><Icon /><span>{label}</span></button>)}
      </nav>
      <div className="nav-label">Workspace</div>
      <nav className="nav-group">
        <button className={`nav-item ${active === 'Risk settings' ? 'active' : ''}`} onClick={() => onNavigate('Risk settings')} data-testid="button-nav-risk-settings"><Settings2 /><span>Risk settings</span></button>
        <button className={`nav-item ${active === 'Session brief' ? 'active' : ''}`} onClick={() => onNavigate('Session brief')} data-testid="button-nav-session-brief"><Newspaper /><span>Session brief</span></button>
      </nav>
      <div className="side-spacer" />
      <div className="desk-status"><div className="desk-status-head"><span>Desk status</span><i className="status-dot" /></div><p>{active === 'Overview' ? 'London → New York overlap' : `${active} selected`}</p></div>
      <div className="side-foot"><span>v1.0.4</span><CircleHelp size={14} /></div>
    </aside>
  );
}

function SnapshotGrid({ bridge }: { bridge?: MarketBridge }) {
  const price = bridge?.spot.price ?? 2341.65;
  const change = bridge?.spot.change;
  const changePercent = bridge?.spot.changePercent;
  const updated = bridge?.spot.timestamp ? new Date(bridge.spot.timestamp * 1000).toISOString().slice(11, 19) + ' UTC' : 'Demo fixture';
  return (
    <section className="snapshot-grid" aria-label="Market snapshot">
      <div className="panel snapshot" data-testid="card-market-snapshot">
        <div className="symbol-row"><span className="symbol">XAUUSD · SPOT GOLD</span><span className="market-badge">Market open</span></div>
        <div><span className="price" data-testid="text-current-price">{formatPrice(price)}</span><span className={`change ${change !== null && change !== undefined && change < 0 ? 'bearish' : ''}`} data-testid="text-price-change">{change === null || change === undefined ? 'Demo snapshot' : `${change >= 0 ? '+' : ''}${change.toFixed(2)} · ${changePercent?.toFixed(2) ?? '—'}%`}</span></div>
        <div className="snapshot-foot"><div><span className="mini-label">Session</span><span className="mini-value">London / NY</span></div><div><span className="mini-label">Updated</span><span className="mini-value">{updated}</span></div></div>
      </div>
      <div className="panel metric-card"><div className="metric-head"><span>Daily range</span><Activity /></div><div className="metric-value">2,326.80—<br />2,347.90</div><span className="metric-sub good">63% delivered</span></div>
      <div className="panel metric-card"><div className="metric-head"><span>Spread</span><Gauge /></div><div className="metric-value">0.18</div><span className="metric-sub good">Tight conditions</span></div>
      <div className="panel metric-card"><div className="metric-head"><span>4H bias</span><TrendingUp /></div><div className="metric-value bullish">Bullish</div><span className="metric-sub">78% confidence</span></div>
      <div className="panel metric-card"><div className="metric-head"><span>Next event</span><Clock3 /></div><div className="metric-value">16:00</div><span className="metric-sub warn">US ISM Services · high</span></div>
    </section>
  );
}

function MarketChart({ timeframe, setTimeframe, tab, setTab }: { timeframe: string; setTimeframe: (value: string) => void; tab: string; setTab: (value: string) => void }) {
  const yLabels = ['2,348', '2,344', '2,340', '2,336', '2,332'];
  return (
    <div className="panel chart-panel" data-testid="panel-market-chart">
      <div className="chart-toolbar">
        <div className="chart-title"><CandlestickChart /> XAUUSD <span className="panel-kicker">/ {timeframe} structure</span></div>
        <div className="chart-tabs" role="tablist">{['Analysis', 'Price action', 'Levels'].map((item) => <button key={item} className={`chart-tab ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)} role="tab" aria-selected={tab === item} data-testid={`button-chart-tab-${item.toLowerCase().replace(' ', '-')}`}>{item}</button>)}</div>
      </div>
      <div className="chart-canvas">
        <svg className="chart-svg" viewBox="0 0 820 340" preserveAspectRatio="none" role="img" aria-label="XAUUSD candlestick analysis chart">
          {[30, 100, 170, 240, 310].map((y, i) => <g key={y}><line x1="45" y1={y} x2="803" y2={y} stroke="hsl(220 16% 18%)" strokeWidth="1" strokeDasharray="2 4" /><text x="0" y={y + 4} fill="hsl(220 12% 52%)" fontSize="9" fontFamily="Space Mono">{yLabels[i]}</text></g>)}
          <rect x="45" y="69" width="758" height="37" fill="hsl(3 72% 61% / .09)" stroke="hsl(3 72% 61% / .38)" strokeDasharray="4 3" />
          <text x="57" y="84" fill="hsl(3 72% 61%)" fontSize="8" fontFamily="Space Mono">BEARISH OB · 2,344.90—2,346.10</text>
          <rect x="45" y="210" width="758" height="31" fill="hsl(168 66% 55% / .1)" stroke="hsl(168 66% 55% / .4)" strokeDasharray="4 3" />
          <text x="57" y="230" fill="hsl(168 66% 55%)" fontSize="8" fontFamily="Space Mono">BULLISH FVG · 2,336.70—2,338.20</text>
          <line x1="45" y1="140" x2="803" y2="140" stroke="hsl(41 89% 62% / .68)" strokeWidth="1" strokeDasharray="6 4" />
          <rect x="707" y="128" width="96" height="22" rx="3" fill="hsl(41 89% 62% / .16)" />
          <text x="716" y="142" fill="hsl(41 89% 62%)" fontSize="9" fontFamily="Space Mono">2,341.65  LIVE</text>
          <line x1="218" y1="28" x2="218" y2="312" stroke="hsl(210 64% 63% / .3)" strokeDasharray="3 4" />
          <text x="193" y="323" fill="hsl(210 64% 63%)" fontSize="8" fontFamily="Space Mono">LONDON OPEN</text>
          {candleData.map(([open, close, low, high, down], i) => {
            const x = 65 + i * 23;
            const bodyTop = Math.min(open, close);
            const bodyHeight = Math.max(Math.abs(close - open), 6);
            const color = down ? 'hsl(3 72% 61%)' : 'hsl(168 66% 55%)';
            return <g key={i}><line x1={x} x2={x} y1={100 + high * 2.05} y2={100 + low * 2.05} stroke={color} strokeWidth="1.2" /><rect x={x - 4} y={100 + bodyTop * 2.05} width="8" height={bodyHeight * 2.05} fill={color} rx="1" /></g>;
          })}
          <polyline points="66,242 89,236 112,242 135,223 158,231 181,217 204,224 227,207 250,213 273,191 296,203 319,181 342,188 365,174 388,181 411,164 434,174 457,158 480,165 503,148 526,159 549,145 572,151 595,138 618,146 641,133 664,141 687,128 710,136 733,124 756,133 779,119" fill="none" stroke="hsl(41 89% 62% / .65)" strokeWidth="1.4" />
          <g><circle cx="572" cy="151" r="4" fill="hsl(41 89% 62%)" /><circle cx="572" cy="151" r="7" fill="none" stroke="hsl(41 89% 62% / .45)" /><text x="580" y="147" fill="hsl(41 89% 62%)" fontSize="8" fontFamily="Space Mono">SSL swept</text></g>
          <text x="53" y="338" fill="hsl(220 12% 52%)" fontSize="8" fontFamily="Space Mono">10:00</text><text x="245" y="338" fill="hsl(220 12% 52%)" fontSize="8" fontFamily="Space Mono">12:00</text><text x="450" y="338" fill="hsl(220 12% 52%)" fontSize="8" fontFamily="Space Mono">14:00</text><text x="670" y="338" fill="hsl(220 12% 52%)" fontSize="8" fontFamily="Space Mono">16:00</text>
        </svg>
      </div>
      <div className="chart-legend"><span className="legend-item"><i className="legend-dot" style={{ background: 'hsl(41 89% 62%)' }} />Live price</span><span className="legend-item"><i className="legend-dot" style={{ background: 'hsl(168 66% 55%)' }} />Bullish FVG</span><span className="legend-item"><i className="legend-dot" style={{ background: 'hsl(3 72% 61%)' }} />Bearish OB</span><span className="legend-item"><i className="legend-dot" style={{ background: 'hsl(210 64% 63%)' }} />Session marker</span><div className="timeframes">{['5m', '15m', '1H', '4H'].map((item) => <button key={item} className={`timeframe ${timeframe === item ? 'active' : ''}`} onClick={() => setTimeframe(item)} data-testid={`button-timeframe-${item}`}>{item}</button>)}</div></div>
    </div>
  );
}

function Recommendation({ onDirection, direction }: { onDirection: (direction: string) => void; direction: string }) {
  const plan = direction === 'SELL'
    ? { reason: 'Secondary sell is conditional: price must tag BSL and reject without a sweep.', trigger: '2,347.90', invalidation: '2,350.20', target: '2,341.65' }
    : direction === 'BUY'
      ? { reason: 'Primary buy is staged around the bullish OB and FVG after a confirmed SSL sweep.', trigger: '2,344.90', invalidation: '2,336.40', target: '2,352.80' }
      : { reason: 'Price is holding above the 1H bullish FVG, but 5m delivery is still retracing. Wait for clean displacement before committing risk.', trigger: '2,344.90', invalidation: '2,336.40', target: '2,352.80' };
  const recConfidence = direction === 'SELL' ? 57 : direction === 'BUY' ? 78 : 64;
  return (
    <div className="panel recommendation" data-testid="panel-recommendation">
      <div className="rec-head"><div className="rec-title"><Target /> Trade recommendation</div><span className="wait-pill">{direction}</span></div>
      <p className="rec-reason" data-testid="text-recommendation-reason">{plan.reason} <span className="gold">Trigger {plan.trigger}</span></p>
      <div className="confidence"><span>Confluence confidence</span><strong>{recConfidence} / 100</strong></div><div className="confidence-bar"><span style={{ width: `${recConfidence}%` }} /></div>
      <div className="risk-result" style={{ marginTop: 16 }}>
        <div className="risk-stat"><span>Trigger</span><strong className="gold">{plan.trigger}</strong></div><div className="risk-stat"><span>Invalidation</span><strong>{plan.invalidation}</strong></div><div className="risk-stat"><span>Target 1</span><strong className="bullish">{plan.target}</strong></div>
      </div>
      <div style={{ display: 'flex', gap: 7, marginTop: 13 }}>
        <button className="refresh-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onDirection('BUY')} data-testid="button-set-buy-plan"><TrendingUp size={13} /> Set BUY plan</button>
        <button className="refresh-btn" style={{ flex: 1, justifyContent: 'center', color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive) / .3)' }} onClick={() => onDirection('SELL')} data-testid="button-set-sell-plan"><TrendingDown size={13} /> Set SELL plan</button>
      </div>
    </div>
  );
}

function LevelsPanel() {
  const levels = [{ label: 'BSL', price: '2,347.90', width: '88%', type: 'sell' }, { label: 'LIVE', price: '2,341.65', width: '58%', type: 'live' }, { label: 'SSL', price: '2,332.40', width: '31%', type: 'buy' }];
  return <div className="panel levels"><div className="section-head"><div className="section-title"><Layers3 /> Liquidity map</div><button className="section-link" data-testid="button-view-all-levels">View all</button></div>{levels.map((level) => <div className="level-row" key={level.label}><span className={`level-label ${level.type === 'sell' ? 'bearish' : level.type === 'buy' ? 'bullish' : 'gold'}`}>{level.label}</span><div className="level-bar"><span style={{ width: level.width, background: level.type === 'sell' ? 'hsl(var(--destructive))' : level.type === 'buy' ? 'hsl(var(--accent))' : 'hsl(var(--primary))' }} /></div><span className="level-price">{level.price}</span></div>)}</div>;
}

function Guardrails() {
  return <div className="panel guardrails"><div className="section-head"><div className="section-title"><ShieldAlert /> Session guardrails</div><span className="status-tag">Active</span></div><div className="guardrail"><Clock3 /><div><strong>London → New York overlap</strong><p>Peak liquidity window · 13:00—16:00 UTC</p></div></div><div className="guardrail"><AlertTriangle /><div><strong>High-impact news in 01:28</strong><p>US ISM Services PMI · 16:00 UTC</p></div><span className="status-tag gold">Caution</span></div><div className="guardrail"><Database /><div><strong>Execution conditions</strong><p>Spread 0.18 · volatility normal</p></div><span className="status-tag">Clear</span></div></div>;
}

function BiasPanel() {
  return <div className="panel detail-panel" data-testid="panel-timeframe-bias"><div className="section-head"><div className="section-title"><TrendingUp /> Multi-timeframe bias</div><span className="panel-kicker">Structure first</span></div>{biasData.map((item) => <div className="bias-row" key={item.timeframe}><span className="bias-tf">{item.timeframe}</span><div><div className={`bias-name ${item.bias === 'Bullish' ? 'bullish' : item.bias === 'Bearish' ? 'bearish' : 'gold'}`}>{item.bias} · {item.structure}</div><div className="bias-meta">{item.bos}</div><div className="bias-meter"><span style={{ width: `${item.confidence}%` }} /></div></div><span className="bias-score">{item.confidence}%</span></div>)}</div>;
}

function InstitutionalFlow({ live, onToggle, bridge, loading, failed }: { live: boolean; onToggle: () => void; bridge?: MarketBridge; loading: boolean; failed: boolean }) {
  const connected = bridge?.sourceMode !== 'unavailable';
  const status = !live ? 'Bridge paused' : loading ? 'Connecting' : failed ? 'Unavailable' : bridge?.freshness.status ?? 'Unavailable';
  const flow = {
    spot: connected ? formatPrice(bridge?.spot.price) : '—',
    futures: connected ? formatPrice(bridge?.futures.price) : '—',
    basis: connected && bridge?.basis.value !== null && bridge?.basis.value !== undefined ? `${bridge.basis.value >= 0 ? '+' : ''}$${formatPrice(bridge.basis.value)}` : '—',
    leadLag: bridge?.leadLagMs === null || bridge?.leadLagMs === undefined ? 'Unavailable' : `GC leads spot · ${bridge.leadLagMs}ms`,
    delta: bridge?.delta === null || bridge?.delta === undefined ? 'Unavailable' : bridge.delta.toLocaleString('en-US'),
    imbalance: bridge?.imbalance.buyPercent === null || bridge?.imbalance.buyPercent === undefined ? 'Unavailable' : `${bridge.imbalance.buyPercent} / ${bridge.imbalance.sellPercent}`,
    openInterest: bridge?.futures.openInterest === null || bridge?.futures.openInterest === undefined ? 'Unavailable' : formatNumber(bridge.futures.openInterest),
    volume: bridge?.futures.volume === null || bridge?.futures.volume === undefined ? 'Unavailable' : formatNumber(bridge.futures.volume),
    priceOi: bridge?.futures.openInterest === null || bridge?.futures.openInterest === undefined ? 'Cannot infer' : 'Observed',
    absorption: bridge?.delta === null || bridge?.delta === undefined ? 'Unavailable' : 'Observed in tape',
  };

  return <div className="panel flow-panel physics-panel" data-testid="panel-institutional-flow">
    <div className="section-head">
      <div>
        <div className="section-title"><Activity /> Data physics bridge</div>
        <div className="panel-kicker flow-subtitle">Observable flow · Spot XAUUSD ↔ COMEX GC</div>
      </div>
      <button className={`flow-source ${connected ? 'active' : ''}`} onClick={onToggle} data-testid="button-toggle-flow-source"><span className="source-dot" />{status}</button>
    </div>

    <div className="market-bridge">
      <div className="market-node">
        <span>Spot XAUUSD</span>
        <strong>{flow.spot}</strong>
        <small>execution reference</small>
      </div>
      <ArrowRight className="bridge-arrow" />
      <div className="market-node futures-node">
        <span>COMEX GC</span>
        <strong>{flow.futures}</strong>
        <small>centralized futures</small>
      </div>
      <div className="basis-box">
        <span>Basis</span>
        <strong className={connected ? 'gold' : ''}>{flow.basis}</strong>
        <small>{connected ? (bridge?.basis.futuresPremium ? 'futures premium' : 'spot premium') : 'awaiting bridge'}</small>
      </div>
    </div>

    <div className="flow-metrics physics-metrics">
      {[
        { label: 'Cumulative delta', value: flow.delta, detail: bridge?.delta === null ? 'tape required' : 'centralized tape', tone: bridge?.delta !== null && bridge?.delta !== undefined ? 'bullish' : 'gold' },
        { label: 'Buy / sell imbalance', value: flow.imbalance, detail: bridge?.imbalance.buyPercent === null ? 'tape required' : 'trade split', tone: bridge?.imbalance.buyPercent !== null && bridge?.imbalance.buyPercent !== undefined ? 'bullish' : 'gold' },
        { label: 'Open interest', value: flow.openInterest, detail: bridge?.futures.openInterest === null ? 'OI feed required' : 'exchange reported', tone: bridge?.futures.openInterest !== null && bridge?.futures.openInterest !== undefined ? 'gold' : 'gold' },
        { label: 'Contract volume', value: flow.volume, detail: bridge?.futures.volume === null ? 'upstream unavailable' : 'upstream reported', tone: bridge?.futures.volume !== null && bridge?.futures.volume !== undefined ? 'gold' : 'gold' },
      ].map((item) => <div className="flow-metric" key={item.label}><span>{item.label}</span><strong className={item.tone}>{item.value}</strong><small>{item.detail}</small></div>)}
    </div>

    <div className="physics-signals">
      <div><span>Price × OI response</span><strong className={bridge?.futures.openInterest !== null && bridge?.futures.openInterest !== undefined ? 'bullish' : 'gold'}>{flow.priceOi}</strong><small>{bridge?.futures.openInterest !== null && bridge?.futures.openInterest !== undefined ? 'new participation proxy' : 'OI feed required'}</small></div>
      <div><span>Absorption / liquidity</span><strong className={bridge?.delta !== null && bridge?.delta !== undefined ? 'gold' : ''}>{flow.absorption}</strong><small>{bridge?.delta !== null && bridge?.delta !== undefined ? 'derived from trade tape' : 'centralized tape required'}</small></div>
      <div><span>Lead / lag</span><strong className={bridge?.leadLagMs !== null && bridge?.leadLagMs !== undefined ? 'bullish' : 'gold'}>{flow.leadLag}</strong><small>{bridge?.leadLagMs !== null && bridge?.leadLagMs !== undefined ? 'futures impulse is leading' : 'tick timestamps required'}</small></div>
    </div>

    <div className="flow-read physics-read"><span className="read-label">Portfolio behavior proxy</span><p>{bridge?.warning ?? 'The Spot ↔ Futures bridge is paused. Do not infer institutional participation from candles alone; restore the feed before upgrading a scenario.'}</p><span className={`read-state ${connected && bridge?.freshness.status === 'fresh' ? 'bullish' : 'gold'}`}>{connected ? bridge?.freshness.status : 'Unavailable'}</span></div>
    <div className="source-strip"><span><Database size={12} /> Spot feed <b className={connected ? 'bullish' : 'gold'}>{connected ? `${bridge?.freshness.spotSeconds}s old` : 'stale'}</b></span><span>COMEX GC <b className={connected ? 'bullish' : 'gold'}>{connected ? `${bridge?.freshness.futuresSeconds}s old` : 'paused'}</b></span><span>COT <b className="gold">weekly context</b></span><span>{connected ? 'Prices live · flow fields explicit' : 'Not measuring upstream yet'}</span></div>
  </div>;
}

function SweepDetector() {
  return <div className="panel sweep-panel" data-testid="panel-sweep-detector">
    <div className="section-head"><div className="section-title"><Zap /> Sweep detector</div><span className="status-tag">Latest event</span></div>
    <div className="sweep-event"><div className="sweep-marker bullish"><TrendingUp size={15} /></div><div className="sweep-main"><div><strong>SSL sweep</strong><span className="sweep-time">14:16 UTC</span></div><p>2,332.40 taken · 5m displacement result +6.8 pts</p></div><span className="confirmed">Confirmed</span></div>
    <div className="sweep-secondary"><span><b>Side</b> Sell-side liquidity</span><span><b>Reaction</b> Bullish close</span><span><b>Follow-through</b> 2 candles</span></div>
    <div className="sweep-muted"><span>Prior BSL sweep</span><span>11:42 UTC · no displacement · rejected</span><span className="bearish">Unconfirmed</span></div>
  </div>;
}

function ScenarioSection({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return <section className="scenario-section" data-testid="section-scenarios">
    <div className="section-head scenario-heading"><div><div className="section-title"><Target /> Scenario matrix</div><p>Pre-commit to the condition, not the candle.</p></div><span className="panel-kicker">3 paths mapped</span></div>
    <div className="scenario-grid">{scenarios.map((scenario) => <button className={`scenario-card ${selected === scenario.id ? 'selected' : ''} ${scenario.direction.toLowerCase()}`} key={scenario.id} onClick={() => onSelect(scenario.id)} data-testid={`button-scenario-${scenario.id}`}>
      <div className="scenario-top"><span className="scenario-label">{scenario.label}</span><span className="scenario-direction">{scenario.direction}</span><span className={`scenario-state ${selected === scenario.id ? 'active' : ''}`}>{selected === scenario.id ? 'Active' : 'Inactive'}</span></div>
      <h3>{scenario.title}</h3>
      <div className="scenario-line"><span>Trigger</span><strong>{scenario.trigger}</strong></div>
      <div className="scenario-line"><span>Invalidation</span><strong>{scenario.invalidation}</strong></div>
      <div className="scenario-line"><span>Target / logic</span><strong>{scenario.target}</strong><small>{scenario.logic}</small></div>
      <div className="scenario-confidence"><span>Confidence</span><strong>{scenario.confidence}%</strong><i><b style={{ width: `${scenario.confidence}%` }} /></i></div>
    </button>)}</div>
  </section>;
}

function UnifiedConfluence({ scenarioId, flowLive, bridge }: { scenarioId: string; flowLive: boolean; bridge?: MarketBridge }) {
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[2];
  const flowAvailable = flowLive && bridge?.sourceMode !== 'unavailable';
  const conflict = scenario.id === 'wait' || !flowAvailable;
  const score = conflict ? (flowAvailable ? 64 : 42) : scenario.confidence;
  const basisText = bridge?.basis.value !== null && bridge?.basis.value !== undefined ? `${bridge.basis.value >= 0 ? '+' : ''}$${formatPrice(bridge.basis.value)} GC ${bridge.basis.futuresPremium ? 'premium' : 'discount'}` : 'Basis unavailable';
  const rows = [
    ['Structure', scenario.id === 'secondary' ? '4H bullish · counter-trend' : '4H / 1H bullish', scenario.id === 'secondary' ? 'Context' : 'Aligned', scenario.id === 'secondary' ? 'gold' : 'bullish'],
    ['Liquidity sweep', scenario.id === 'primary' ? 'SSL swept at 2,332.40' : scenario.id === 'secondary' ? 'BSL not swept' : 'Decision zone', scenario.id === 'primary' ? 'Confirmed' : 'Pending', scenario.id === 'primary' ? 'bullish' : 'gold'],
    ['OB evidence', 'Long wick · BOS · displacement/volume', scenario.id === 'wait' ? 'Valid, awaiting trigger' : 'Confirmed', scenario.id === 'wait' ? 'gold' : 'bullish'],
    ['FVG validation', '1H bullish FVG · BOS validated', 'Validated', 'bullish'],
    ['Spot ↔ futures basis', flowAvailable ? basisText : 'Bridge paused', flowAvailable ? 'Observed' : 'Unavailable', flowAvailable ? 'bullish' : 'gold'],
    ['Price × OI response', bridge?.futures.openInterest !== null && bridge?.futures.openInterest !== undefined ? 'OI observed · participation proxy' : 'OI unavailable', bridge?.futures.openInterest !== null && bridge?.futures.openInterest !== undefined ? 'Supports' : 'Unavailable', bridge?.futures.openInterest !== null && bridge?.futures.openInterest !== undefined ? 'bullish' : 'gold'],
    ['Order flow delta', bridge?.delta !== null && bridge?.delta !== undefined ? `${bridge.delta.toLocaleString()} · tape delta` : 'Delta unavailable', bridge?.delta !== null && bridge?.delta !== undefined ? 'Supports' : 'Unavailable', bridge?.delta !== null && bridge?.delta !== undefined ? 'bullish' : 'gold'],
    ['Session timing', 'London / New York overlap', 'Active', 'bullish'],
    ['News guardrail', 'US ISM Services in 01:28', scenario.id === 'wait' ? 'Conflict' : 'Caution', scenario.id === 'wait' ? 'bearish' : 'gold'],
  ];
  return <div className="panel confluence-panel" data-testid="panel-unified-confluence"><div className="confluence-score"><div><div className="section-title"><ShieldAlert /> Unified confluence</div><p>{conflict ? 'Conditions conflict or the flow source is unavailable. Keep the desk in WAIT.' : `Scenario ${scenario.label} ${scenario.direction} has enough evidence to stage, not chase.`}</p></div><div className={`score-ring ${conflict ? 'conflict' : ''}`}><strong>{score}</strong><span>/100</span></div></div><div className="confluence-rows">{rows.map(([label, value, state, tone]) => <div className="confluence-row" key={label}><span>{label}</span><strong>{value}</strong><em className={tone}>{state}</em></div>)}</div></div>;
}

function ZonesPanel() {
  const zones = [{ type: 'Bullish FVG', meta: '1H · BOS validated', level: '2,336.70—2,338.20', swatch: 'buy' }, { type: 'Bullish OB', meta: '4H · unmitigated', level: '2,329.40—2,333.10', swatch: 'buy' }, { type: 'Bearish OB', meta: '15m · unmitigated', level: '2,344.90—2,346.10', swatch: 'sell' }, { type: 'SSL', meta: 'Liquidity · unswept', level: '2,332.40', swatch: 'buy' }];
  return <div className="panel detail-panel" data-testid="panel-confluence-zones">
    <div className="section-head"><div className="section-title"><Zap /> Confluence zones</div><span className="panel-kicker">4 mapped</span></div>
    {zones.map((zone) => <div className="zone-row" key={zone.type}><div className="zone-name"><i className={`zone-swatch ${zone.swatch === 'sell' ? 'sell' : ''}`} /><div><span>{zone.type}</span><div className="zone-meta">{zone.meta}</div></div></div><span className="zone-level">{zone.level}</span></div>)}
    <div className="ob-evidence"><div className="ob-evidence-head"><span>Active OB evidence</span><span className="evidence-state">UNMITIGATED · 7 CANDLES</span></div><div className="evidence-grid"><span><b>Long wick</b><em>Pass</em></span><span><b>Post-OB BOS</b><em>Confirmed</em></span><span><b>Displacement / volume</b><em>Confirmed</em></span></div></div>
    <div className="filter-note"><span>Active filter</span><span>1 mitigated OB excluded · age 38 candles</span></div>
  </div>;
}

function RiskPanel() {
  const [balance, setBalance] = useState('10000');
  const [risk, setRisk] = useState('0.75');
  const amount = Math.max(0, (Number(balance) || 0) * (Number(risk) || 0) / 100);
  const size = amount ? (amount / 8.5).toFixed(2) : '0.00';
  return <div className="panel risk-panel" data-testid="panel-risk-sizing"><div className="section-head"><div className="section-title"><Gauge /> Risk sizing</div><span className="panel-kicker">Per setup</span></div><div className="input-grid"><div className="field"><label htmlFor="balance">Account balance</label><input id="balance" type="number" value={balance} onChange={(event) => setBalance(event.target.value)} data-testid="input-account-balance" /></div><div className="field"><label htmlFor="risk">Risk per trade (%)</label><input id="risk" type="number" min="0" max="10" step=".05" value={risk} onChange={(event) => setRisk(event.target.value)} data-testid="input-risk-percent" /></div></div><div className="risk-result"><div className="risk-stat"><span>Risk amount</span><strong data-testid="text-risk-amount">${amount.toFixed(2)}</strong></div><div className="risk-stat"><span>Stop distance</span><strong>8.50 pts</strong></div><div className="risk-stat"><span>Suggested size</span><strong className="gold" data-testid="text-position-size">{size} lots</strong></div></div></div>;
}

function Watchlist() {
  const items = [{ symbol: 'XAUUSD', price: '2,341.65', change: '+0.79%', cls: 'bullish' }, { symbol: 'DXY', price: '104.18', change: '-0.22%', cls: 'bearish' }, { symbol: 'US10Y', price: '4.271%', change: '+0.04%', cls: 'bearish' }];
  return <div className="panel watch-panel" data-testid="panel-watchlist"><div className="section-head"><div className="section-title"><Activity /> Recent analysis</div><button className="section-link" data-testid="button-open-watchlist">Open watchlist</button></div><div className="watch-list">{items.map((item) => <button className="watch-item" key={item.symbol} data-testid={`button-watch-${item.symbol}`}><span className="watch-symbol">{item.symbol}</span><span className="watch-price">{item.price}</span><span className={`watch-change ${item.cls}`}>{item.change} today</span></button>)}</div></div>;
}

type ReplayDecision = {
  time: string;
  price: number;
  event: string;
  delta: number;
  oiChange: number;
  decision: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  result: 'WIN' | 'LOSS' | 'NO TRADE';
  r: number;
  evidence: string;
};

const replayTape: ReplayDecision[] = [
  { time: '09:35', price: 2334.2, event: 'Range open', delta: -820, oiChange: -0.2, decision: 'WAIT', confidence: 48, result: 'NO TRADE', r: 0, evidence: 'No displacement after liquidity probe' },
  { time: '10:10', price: 2332.6, event: 'SSL probe', delta: -1540, oiChange: 0.1, decision: 'WAIT', confidence: 56, result: 'NO TRADE', r: 0, evidence: 'Sweep present; acceptance not confirmed' },
  { time: '10:45', price: 2336.9, event: 'SSL sweep + BOS', delta: 6420, oiChange: 1.2, decision: 'BUY', confidence: 78, result: 'WIN', r: 2.1, evidence: 'Positive delta and OI expansion after reclaim' },
  { time: '11:20', price: 2339.4, event: 'FVG delivery', delta: 1880, oiChange: 0.4, decision: 'WAIT', confidence: 62, result: 'NO TRADE', r: 0, evidence: 'Price extended; no clean re-entry' },
  { time: '12:05', price: 2346.1, event: 'BSL tag', delta: 2140, oiChange: -0.8, decision: 'SELL', confidence: 59, result: 'LOSS', r: -1, evidence: 'OI contraction invalidated fade; buyers accepted above BSL' },
  { time: '13:10', price: 2341.8, event: 'Bearish rejection', delta: -4620, oiChange: -1.1, decision: 'SELL', confidence: 67, result: 'WIN', r: 1.6, evidence: 'Negative delta with falling OI after failed BSL acceptance' },
  { time: '14:20', price: 2337.4, event: 'London low retest', delta: 920, oiChange: 0.3, decision: 'WAIT', confidence: 54, result: 'NO TRADE', r: 0, evidence: 'Compression; no asymmetry around the zone' },
  { time: '15:05', price: 2332.8, event: 'SSL sweep + impulse', delta: 5140, oiChange: 0.9, decision: 'BUY', confidence: 74, result: 'WIN', r: 1.9, evidence: 'Sweep reclaimed with aggressive buying and new OI' },
  { time: '15:40', price: 2344.7, event: 'BSL absorption test', delta: 3880, oiChange: -0.5, decision: 'BUY', confidence: 63, result: 'LOSS', r: -1, evidence: 'Aggressive buys met passive offer; no acceptance' },
];

function ReplayPanel() {
  const [cursor, setCursor] = useState(replayTape.length);
  const [running, setRunning] = useState(false);
  const visibleTape = replayTape.slice(0, cursor);
  const stats = useMemo(() => {
    const trades = visibleTape.filter((item) => item.result !== 'NO TRADE');
    const wins = trades.filter((item) => item.result === 'WIN').length;
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;
    for (const trade of trades) {
      equity += trade.r;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
    }
    const hitRate = trades.length ? (wins / trades.length) * 100 : 0;
    const averageConfidence = trades.length ? trades.reduce((sum, item) => sum + item.confidence, 0) / trades.length : 0;
    return {
      decisions: visibleTape.length,
      trades: trades.length,
      hitRate,
      totalR: equity,
      averageR: trades.length ? equity / trades.length : 0,
      maxDrawdown,
      confidenceGap: Math.abs(averageConfidence - hitRate),
    };
  }, [visibleTape]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setCursor((value) => Math.min(value + 1, replayTape.length)), 520);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (cursor >= replayTape.length) setRunning(false);
  }, [cursor]);

  const current = visibleTape.at(-1);
  return <section className="replay-section" data-testid="section-replay-lab">
    <div className="section-head replay-heading">
      <div><div className="section-title"><RefreshCw /> Causal replay lab</div><p>Every decision only sees data printed before its timestamp.</p></div>
      <div className="replay-actions"><button className="section-link" onClick={() => { setCursor(0); setRunning(false); }} data-testid="button-reset-replay">Reset</button><button className="refresh-btn" onClick={() => setRunning((value) => !value)} data-testid="button-play-replay">{running ? 'Pause replay' : cursor >= replayTape.length ? 'Replay again' : 'Play replay'}</button></div>
    </div>
    <div className="replay-controls"><span>Session tape</span><input aria-label="Replay position" type="range" min="0" max={replayTape.length} value={cursor} onChange={(event) => { setRunning(false); setCursor(Number(event.target.value)); }} data-testid="input-replay-position" /><strong>{cursor} / {replayTape.length}</strong></div>
    <div className="replay-stats">
      <div><span>Decisions</span><strong>{stats.decisions}</strong><small>BUY / SELL / WAIT</small></div>
      <div><span>Observed hit rate</span><strong className={stats.hitRate >= 50 ? 'bullish' : 'bearish'}>{stats.trades ? `${stats.hitRate.toFixed(0)}%` : '—'}</strong><small>{stats.trades} resolved trades</small></div>
      <div><span>Expectancy</span><strong className={stats.averageR >= 0 ? 'bullish' : 'bearish'}>{stats.trades ? `${stats.averageR >= 0 ? '+' : ''}${stats.averageR.toFixed(2)}R` : '—'}</strong><small>after simulated costs</small></div>
      <div><span>Max drawdown</span><strong className="gold">{stats.trades ? `${stats.maxDrawdown.toFixed(2)}R` : '—'}</strong><small>peak-to-trough</small></div>
      <div><span>Confidence gap</span><strong className={stats.confidenceGap <= 12 ? 'bullish' : 'gold'}>{stats.trades ? `${stats.confidenceGap.toFixed(0)} pts` : '—'}</strong><small>score vs hit rate</small></div>
    </div>
    <div className="replay-current">{current ? <><span className="read-label">Current replay state</span><strong>{current.time} · {current.event} · {current.price.toFixed(2)}</strong><span className={`replay-decision ${current.decision.toLowerCase()}`}>{current.decision}</span><p>{current.evidence}</p></> : <><span className="read-label">Current replay state</span><strong>Session reset</strong><p>Move the cursor or play the tape to expose decisions causally.</p></>}</div>
    <div className="replay-table" role="table" aria-label="Replay decisions">
      <div className="replay-row replay-table-head" role="row"><span>Time</span><span>Event</span><span>Delta / OI</span><span>Decision</span><span>Result</span><span>R</span></div>
      {visibleTape.map((item) => <div className="replay-row" key={item.time} role="row"><span>{item.time}</span><span>{item.event}</span><span>{item.delta >= 0 ? '+' : ''}{item.delta.toLocaleString()} / {item.oiChange >= 0 ? '+' : ''}{item.oiChange.toFixed(1)}%</span><strong className={`replay-decision ${item.decision.toLowerCase()}`}>{item.decision}</strong><span className={item.result === 'WIN' ? 'bullish' : item.result === 'LOSS' ? 'bearish' : 'gold'}>{item.result}</span><span className={item.r > 0 ? 'bullish' : item.r < 0 ? 'bearish' : ''}>{item.r > 0 ? '+' : ''}{item.r.toFixed(1)}R</span></div>)}
    </div>
    <div className="replay-footnote"><span>Measurement boundary</span><span>Results are fixture-session evidence, not a live win-rate claim. Add exchange-grade history before using calibration for capital decisions.</span></div>
  </section>;
}

function Home() {
  const [active, setActive] = useState('Overview');
  const [live, setLive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState('14:32:08 UTC');
  const [timeframe, setTimeframe] = useState('15m');
  const [tab, setTab] = useState('Analysis');
  const [direction, setDirection] = useState('WAIT');
  const [scenarioId, setScenarioId] = useState('wait');
  const [flowLive, setFlowLive] = useState(true);
  const bridgeQuery = useGetMarketBridge({ range: '1d', interval: '5m' }, { query: { queryKey: ['market-bridge', '1d', '5m'], enabled: live && flowLive, refetchInterval: 60000, refetchOnWindowFocus: false, retry: 1 } });
  const bridge = live && flowLive ? bridgeQuery.data : undefined;
  const refresh = () => { setRefreshing(true); window.setTimeout(() => { setRefreshing(false); setUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' UTC'); }, 650); };
  const contextText = useMemo(() => direction === 'WAIT' ? 'Awaiting displacement' : `${direction} scenario staged`, [direction]);
  const selectScenario = (id: string) => {
    setScenarioId(id);
    const selected = scenarios.find((scenario) => scenario.id === id);
    if (selected) setDirection(selected.direction);
  };
  const setPlanDirection = (next: string) => {
    setDirection(next);
    setScenarioId(next === 'BUY' ? 'primary' : 'secondary');
  };
  return <div className="app-shell"><Sidebar active={active} onNavigate={setActive} /><main className="main"><Header live={live} onToggle={() => setLive((value) => !value)} onRefresh={refresh} refreshing={refreshing} /><div className="content">
    <div className="page-heading"><div><p className="eyebrow">Institutional price action · {contextText}</p><h1>Gold command center</h1><p className="page-note">Read the draw on liquidity. Confirm displacement. Size the risk.</p></div><div className="timestamp"><span data-testid="text-last-updated">Last analysis {updated}</span><button className={`refresh-btn ${refreshing ? 'spinning' : ''}`} onClick={refresh} data-testid="button-refresh-analysis"><RefreshCw size={13} /> Refresh analysis</button></div></div>
     <SnapshotGrid bridge={bridge} />
    <div className="workspace"><div><MarketChart timeframe={timeframe} setTimeframe={setTimeframe} tab={tab} setTab={setTab} /><div className="detail-grid"><BiasPanel /><ZonesPanel /></div></div><div className="side-stack"><Recommendation direction={direction} onDirection={setPlanDirection} /><LevelsPanel /><Guardrails /></div></div>
     <div className="intel-grid"><InstitutionalFlow live={flowLive} onToggle={() => setFlowLive((value) => !value)} bridge={bridge} loading={bridgeQuery.isLoading} failed={bridgeQuery.isError} /><SweepDetector /></div>
    <ScenarioSection selected={scenarioId} onSelect={selectScenario} />
     <UnifiedConfluence scenarioId={scenarioId} flowLive={flowLive} bridge={bridge} />
     <ReplayPanel />
    <div className="bottom-strip"><RiskPanel /><Watchlist /></div>
    <div className="disclaimer"><CircleHelp /><span><strong>Analysis aid, not financial advice.</strong> Market conditions change quickly; levels are scenarios, not promises. No accuracy rate is guaranteed, including 95% or any other figure. Validate your own plan before risking capital.</span></div>
  </div></main></div>;
}

function Router() {
  return <ErrorBoundary resetKey={useLocation()[0]}><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
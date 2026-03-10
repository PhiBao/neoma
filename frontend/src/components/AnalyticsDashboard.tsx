import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import type { MarketInfo } from "../hooks/useMarkets";
import { ethers } from "ethers";

// ── Color palette ───────────────────────────────────────────────────
const STATE_COLORS: Record<string, string> = {
  Active: "#8b5cf6",
  "Voting Ended": "#6366f1",
  Resolving: "#f59e0b",
  Resolved: "#10b981",
  Cancelled: "#ef4444",
  Expired: "#f97316",
};

// ── Helpers ─────────────────────────────────────────────────────────
function displayState(m: MarketInfo): string {
  if (m.state === 0 && Date.now() / 1000 > m.endTime) return "Voting Ended";
  return ["Active", "Resolving", "Resolved", "Cancelled", "Expired"][m.state] ?? "Unknown";
}

function formatEth(wei: bigint): string {
  const val = Number(ethers.formatEther(wei));
  if (val >= 1) return val.toFixed(2);
  if (val >= 0.01) return val.toFixed(4);
  return val.toFixed(6);
}

// Custom tooltip for pie chart — uses each slice's fill color
function PieTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { fill: string } }>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "12px",
      }}
    >
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: entry.payload.fill }}
          />
          <span style={{ color: entry.payload.fill, fontWeight: 500 }}>{entry.name}</span>
          <span style={{ color: "var(--text-primary)" }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────

// Typed recharts bar click handler
interface BarClickData {
  address?: string;
  name?: string;
  pool?: number;
  voters?: number;
}

interface Props {
  markets: MarketInfo[];
  onNavigate: (address: string) => void;
}

export function AnalyticsDashboard({ markets, onNavigate }: Props) {
  // ── Computed stats ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalMarkets = markets.length;
    const totalVoters = markets.reduce((s, m) => s + m.totalVoters, 0);
    const totalPoolWei = markets.reduce((s, m) => s + m.totalPool, 0n);
    const resolved = markets.filter((m) => m.state === 2).length;
    const active = markets.filter((m) => m.state === 0).length;

    // State distribution for pie chart
    const stateMap: Record<string, number> = {};
    for (const m of markets) {
      const label = displayState(m);
      stateMap[label] = (stateMap[label] ?? 0) + 1;
    }
    const stateData = Object.entries(stateMap).map(([name, value]) => ({ name, value }));

    // Top markets by pool
    const topByPool = [...markets]
      .sort((a, b) => (b.totalPool > a.totalPool ? 1 : -1))
      .slice(0, 8)
      .map((m) => ({
        name: m.question.length > 30 ? m.question.slice(0, 28) + "…" : m.question,
        pool: Number(ethers.formatEther(m.totalPool)),
        voters: m.totalVoters,
        address: m.address,
      }));

    // Top markets by voters
    const topByVoters = [...markets]
      .sort((a, b) => b.totalVoters - a.totalVoters)
      .slice(0, 8)
      .map((m) => ({
        name: m.question.length > 30 ? m.question.slice(0, 28) + "…" : m.question,
        voters: m.totalVoters,
        pool: Number(ethers.formatEther(m.totalPool)),
        address: m.address,
      }));

    // Average stake
    const stakes = markets.map((m) => Number(ethers.formatEther(m.stakeAmount)));
    const avgStake = stakes.length ? stakes.reduce((a, b) => a + b, 0) / stakes.length : 0;

    // Options count distribution
    const optionCounts: Record<number, number> = {};
    for (const m of markets) {
      const count = m.options.length;
      optionCounts[count] = (optionCounts[count] ?? 0) + 1;
    }
    const optionDistribution = Object.entries(optionCounts)
      .map(([k, v]) => ({ name: `${k} options`, value: v }))
      .sort((a, b) => parseInt(a.name) - parseInt(b.name));

    return {
      totalMarkets,
      totalVoters,
      totalPoolWei,
      resolved,
      active,
      stateData,
      topByPool,
      topByVoters,
      avgStake,
      optionDistribution,
    };
  }, [markets]);

  if (markets.length === 0) {
    return (
      <div className="text-center py-20 text-sm text-[var(--text-muted)]">
        No market data available for analytics.
      </div>
    );
  }

  // Custom tooltip style
  const tooltipStyle = {
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--text-secondary)",
  };

  return (
    <div className="space-y-8 fade-up">
      {/* ── KPI Row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Markets", value: stats.totalMarkets.toString(), icon: "📊" },
          { label: "Total Voters", value: stats.totalVoters.toLocaleString(), icon: "👥" },
          { label: "Total Pool", value: `${formatEth(stats.totalPoolWei)} ETH`, icon: "💎" },
          { label: "Avg Stake", value: `${stats.avgStake.toFixed(4)} ETH`, icon: "⚖️" },
        ].map(({ label, value, icon }) => (
          <div
            key={label}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 text-center"
          >
            <div className="text-xl mb-1">{icon}</div>
            <div className="text-lg font-bold text-[var(--text-primary)]">{value}</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Charts Row 1: State Distribution + Options Distribution ─ */}
      <div className="grid sm:grid-cols-2 gap-6">
        {/* State Pie */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Market State Distribution</h4>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={stats.stateData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
                fontSize={11}
              >
                {stats.stateData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={STATE_COLORS[entry.name] ?? "#64748b"}
                  />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: "11px", color: "var(--text-muted)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Options Distribution */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Options per Market</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.optionDistribution} layout="vertical">
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Markets" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Chart Row 2: Top by Pool ─────────────────────────────── */}
      {stats.topByPool.length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Top Markets by Pool Size (ETH)</h4>
          <ResponsiveContainer width="100%" height={Math.max(200, stats.topByPool.length * 36)}>
            <BarChart data={stats.topByPool} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <YAxis
                dataKey="name"
                type="category"
                width={200}
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar
                dataKey="pool"
                fill="#6366f1"
                radius={[0, 4, 4, 0]}
                name="Pool (ETH)"
                cursor="pointer"
                onClick={(data: BarClickData) => {
                  if (data?.address) onNavigate(data.address);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Chart Row 3: Top by Voters ───────────────────────────── */}
      {stats.topByVoters.length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Top Markets by Voter Count</h4>
          <ResponsiveContainer width="100%" height={Math.max(200, stats.topByVoters.length * 36)}>
            <BarChart data={stats.topByVoters} layout="vertical">
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <YAxis
                dataKey="name"
                type="category"
                width={200}
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar
                dataKey="voters"
                fill="#0ea5e9"
                radius={[0, 4, 4, 0]}
                name="Voters"
                cursor="pointer"
                onClick={(data: BarClickData) => {
                  if (data?.address) onNavigate(data.address);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Markets Table ────────────────────────────────────────── */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">All Markets</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-muted)] text-xs border-b border-[var(--border)]">
                <th className="px-4 py-2 text-left font-medium">Question</th>
                <th className="px-4 py-2 text-center font-medium">State</th>
                <th className="px-4 py-2 text-right font-medium">Pool</th>
                <th className="px-4 py-2 text-right font-medium">Voters</th>
                <th className="px-4 py-2 text-right font-medium">Options</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m, i) => (
                <tr
                  key={m.address}
                  onClick={() => onNavigate(m.address)}
                  className={`border-b border-[var(--border)] last:border-0 hover:bg-white/[0.02] transition cursor-pointer ${
                    i % 2 === 0 ? "" : "bg-white/[0.01]"
                  }`}
                >
                  <td className="px-4 py-2.5 text-[var(--text-secondary)] max-w-[280px] truncate">
                    {m.question}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        color: STATE_COLORS[displayState(m)] ?? "#94a3b8",
                        backgroundColor: `${STATE_COLORS[displayState(m)] ?? "#94a3b8"}20`,
                      }}
                    >
                      {displayState(m)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--text-muted)] font-mono text-xs">
                    {formatEth(m.totalPool)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                    {m.totalVoters}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                    {m.options.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

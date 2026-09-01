import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, ShieldCheck, Phone, Globe2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin user-analytics dashboard (GENE v1.8) — backs
 * server/gene/user-analytics.ts. Strict-admin only, same gate as
 * Payout Approvals. Real data only: every number here comes straight from
 * storage.getAllUsers(); no placeholder/sample numbers anywhere.
 */

interface Overview {
  totalUsers: number;
  verifiedUsers: number;
  usersWithPhone: number;
  usersWithCountryCode: number;
  byRole: Record<string, number>;
  byAuthProvider: Record<string, number>;
}

interface SignupsSeries {
  days: number;
  series: Array<{ date: string; signups: number }>;
  undatedAccountCount: number;
}

interface CountryBreakdown {
  totalUsers: number;
  missingCountryCode: number;
  breakdown: Array<{ countryCode: string; count: number }>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || `Failed to load ${url}`);
  return res.json();
}

export default function AdminAnalytics() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [signups, setSignups] = useState<SignupsSeries | null>(null);
  const [countries, setCountries] = useState<CountryBreakdown | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [o, s, c] = await Promise.all([
          fetchJson<Overview>("/api/gene/analytics/users/overview"),
          fetchJson<SignupsSeries>("/api/gene/analytics/users/signups-over-time?days=30"),
          fetchJson<CountryBreakdown>("/api/gene/analytics/users/by-country"),
        ]);
        setOverview(o);
        setSignups(s);
        setCountries(c);
      } catch (err: any) {
        toast({ title: "Couldn't load analytics", description: err?.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Globe2 className="h-7 w-7 text-accent" /> User Analytics
        </h1>
        <p className="text-muted-foreground mt-1">Real signup and reach numbers — no sample data.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Users className="h-5 w-5" />} label="Total users" value={overview?.totalUsers ?? 0} />
        <StatCard icon={<ShieldCheck className="h-5 w-5" />} label="Verified" value={overview?.verifiedUsers ?? 0} />
        <StatCard icon={<Phone className="h-5 w-5" />} label="With phone" value={overview?.usersWithPhone ?? 0} />
        <StatCard icon={<Globe2 className="h-5 w-5" />} label="With country" value={overview?.usersWithCountryCode ?? 0} />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signups — last {signups?.days ?? 30} days</CardTitle>
            <CardDescription>
              {signups?.undatedAccountCount ? `${signups.undatedAccountCount} older account(s) have no signup date on record and aren't in this chart.` : "Every account has a recorded signup date."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={signups?.series ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} width={30} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="signups" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Users by country</CardTitle>
            <CardDescription>
              From phone country code at signup.
              {countries?.missingCountryCode ? ` ${countries.missingCountryCode} user(s) haven't provided one.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {countries && countries.breakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={countries.breakdown.slice(0, 10)} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="countryCode" width={60} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">No country data yet — this fills in as users sign up with a phone number.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(overview?.byRole ?? {}).map(([role, count]) => (
              <div key={role} className="flex justify-between text-sm">
                <span className="capitalize text-muted-foreground">{role}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By sign-in method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(overview?.byAuthProvider ?? {}).map(([provider, count]) => (
              <div key={provider} className="flex justify-between text-sm">
                <span className="capitalize text-muted-foreground">{provider}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">{icon} {label}</CardDescription>
        <CardTitle className="text-2xl">{value.toLocaleString()}</CardTitle>
      </CardHeader>
    </Card>
  );
}

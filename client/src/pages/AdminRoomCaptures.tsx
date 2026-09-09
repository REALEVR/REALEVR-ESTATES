import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Camera, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin overview of every property mid-way through the guided room-capture
 * flow (client/src/components/admin/RoomCaptureGuide.tsx — an agent walks
 * each room with their phone camera, including a single 360/panorama shot
 * where they have one) but not yet finalized into a published virtual
 * tour. Backed by GET /api/admin/room-capture-drafts
 * (server/room-capture.ts's listRoomCaptureDrafts) — admin-only, since it
 * spans every agent's properties, not just the caller's own.
 *
 * This is visibility, not a second finalize control: an agent finishes
 * their own capture from their own dashboard (Virtual Tours tab -> the
 * property's tour manager, which already has the real "Finalize" button
 * with full upload progress). "Open tour manager" here jumps straight to
 * that same page so an admin can step in and finish it on the agent's
 * behalf if needed, rather than duplicating that progress UI here.
 */

type RoomKind = "equirect_photo" | "equirect_video" | "photo_sweep" | "walkthrough_video";
type RoomStatus = "qualified" | "needs_retake";

interface DraftRoom {
  name: string;
  kind: RoomKind;
  status: RoomStatus;
  assetCount: number;
  thumbnailUrl?: string;
}

interface DraftRow {
  propertyId: string;
  propertyTitle: string;
  agentName?: string;
  createdAt: string;
  updatedAt: string;
  roomCount: number;
  qualifiedCount: number;
  rooms: DraftRoom[];
}

const KIND_LABEL: Record<RoomKind, string> = {
  equirect_photo: "360° photo",
  equirect_video: "360° video",
  photo_sweep: "Photo sweep",
  walkthrough_video: "Walkthrough video",
};

export default function AdminRoomCaptures() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/room-capture-drafts", { credentials: "include" });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error((data as any)?.message || "Failed to load in-progress room captures.");
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast({ title: "Couldn't load room captures", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Camera className="h-7 w-7 text-accent" /> Rooms Awaiting a Virtual Tour
          </h1>
          <p className="text-muted-foreground mt-1">
            Properties an agent has started capturing with their phone camera — panoramas included — but hasn't
            finalized into a published tour yet.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16 text-muted-foreground">
            Nothing in progress right now — every agent's captured rooms have either been published or not started
            yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <Card key={row.propertyId}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-lg">{row.propertyTitle}</CardTitle>
                    <CardDescription>
                      {row.agentName ? `${row.agentName} · ` : ""}
                      {row.qualifiedCount} of {row.roomCount} room{row.roomCount === 1 ? "" : "s"} ready · updated{" "}
                      {new Date(row.updatedAt).toLocaleString()}
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/admin/virtual-tour-manager?propertyId=${row.propertyId}`}>Open tour manager</a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {row.rooms.map((room) => (
                    <div
                      key={room.name}
                      className="w-32 rounded-lg border border-border overflow-hidden bg-muted/30"
                    >
                      <div className="h-20 w-full bg-muted flex items-center justify-center overflow-hidden">
                        {room.thumbnailUrl ? (
                          <img src={room.thumbnailUrl} alt={room.name} className="h-full w-full object-cover" />
                        ) : (
                          <Camera className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-medium truncate">{room.name}</p>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <Badge variant={room.status === "qualified" ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
                            {room.status === "qualified" ? "Ready" : "Needs retake"}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {KIND_LABEL[room.kind]} · {room.assetCount} file{room.assetCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

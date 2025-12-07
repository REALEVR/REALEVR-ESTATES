import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Video, Save, Eye } from "lucide-react";

interface VideoSettings {
  heroVideoUrl: string;
  lastUpdated?: string;
}

export default function VideoManager() {
  const [videoSettings, setVideoSettings] = useState<VideoSettings>({
    heroVideoUrl: ""
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const { toast } = useToast();

  // Load current video settings
  useEffect(() => {
    fetchVideoSettings();
  }, []);

  const fetchVideoSettings = async () => {
    try {
      const response = await fetch(import.meta.env.VITE_BACKEND_URL +"/api/admin/video-settings");
      if (response.ok) {
        const data = await response.json();
        setVideoSettings(data);
        setPreviewUrl(data.heroVideoUrl);
      } else {
        // If no settings exist, use default
        const defaultSettings = {
          heroVideoUrl: "https://youtu.be/cgM6poO2JmY?t=9"
        };
        setVideoSettings(defaultSettings);
        setPreviewUrl(defaultSettings.heroVideoUrl);
      }
    } catch (error) {
      console.error("Error fetching video settings:", error);
      toast({
        title: "Error",
        description: "Failed to load video settings",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!videoSettings.heroVideoUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid video URL",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(import.meta.env.VITE_BACKEND_URL +"/api/admin/video-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(videoSettings),
      });

      if (response.ok) {
        const savedData = await response.json();
        console.log("Video settings saved:", savedData);
        toast({
          title: "Success",
          description: "Video settings saved successfully",
        });
        setPreviewUrl(videoSettings.heroVideoUrl);
        // Refresh the settings to get updated timestamp
        fetchVideoSettings();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save settings");
      }
    } catch (error) {
      console.error("Error saving video settings:", error);
      toast({
        title: "Error",
        description: "Failed to save video settings",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const extractVideoId = (url: string) => {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const getEmbedUrl = (url: string) => {
    // Check if it's a playlist URL
    if (url.includes('playlist?list=') || url.includes('&list=')) {
      const playlistId = url.includes('playlist?list=')
        ? url.split('playlist?list=')[1]?.split('&')[0]
        : url.split('&list=')[1]?.split('&')[0];
      return `https://www.youtube.com/embed/videoseries?list=${playlistId}`;
    }

    // Regular single video
    const videoId = extractVideoId(url);
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Homepage Video Manager
        </CardTitle>
        <CardDescription>
          Manage the hero video displayed on your homepage
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="videoUrl">YouTube Video URL</Label>
          <Input
            id="videoUrl"
            placeholder="https://youtu.be/cgM6poO2JmY?t=9"
            value={videoSettings.heroVideoUrl}
            onChange={(e) => 
              setVideoSettings(prev => ({ ...prev, heroVideoUrl: e.target.value }))
            }
          />
          <p className="text-sm text-gray-500">
            Supports YouTube URLs (youtu.be, youtube.com/watch) and playlists (youtube.com/playlist?list=)
          </p>
        </div>

        {previewUrl && getEmbedUrl(previewUrl) && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Current Video Preview
            </Label>
            <div className="aspect-video bg-black rounded-lg overflow-hidden max-h-64">
              <iframe
                src={getEmbedUrl(previewUrl) || ''}
                title="Video Preview"
                className="w-full h-full"
                allowFullScreen
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="flex items-center gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        {videoSettings.lastUpdated && (
          <p className="text-sm text-gray-500">
            Last updated: {new Date(videoSettings.lastUpdated).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

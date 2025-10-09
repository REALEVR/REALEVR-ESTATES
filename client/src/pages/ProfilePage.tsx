import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocation, Link } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings, User, Home, Calendar, Bell, LogOut, Phone, Edit, Save, X } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function ProfilePage() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("profile");
  const [location] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: "",
    phoneNumber: "",
    companyName: ""
  });

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setEditForm({
        fullName: user.fullName || "",
        phoneNumber: user.phoneNumber || "",
        companyName: user.companyName || ""
      });
    }
  }, [user]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (profileData: { fullName?: string; phoneNumber?: string; companyName?: string }) => {
      const response = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        throw new Error("Failed to update profile");
      }

      return response.json();
    },
    onSuccess: (updatedUser) => {
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
      setIsEditing(false);
      // Update the user data in the auth context
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    // Reset form to original values
    if (user) {
      setEditForm({
        fullName: user.fullName || "",
        phoneNumber: user.phoneNumber || "",
        companyName: user.companyName || ""
      });
    }
  };

  const handleSaveEdit = () => {
    updateProfileMutation.mutate(editForm);
  };

  const handleInputChange = (field: string, value: string) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Extract tab from URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (tabParam && ["profile", "settings", "properties", "bookings", "notifications"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location]);
  
  // Redirect if user is not logged in
  if (!user) {
    return <Redirect to="/auth" />;
  }

  if (user.role === 'agent') {
    return <Redirect to="/agent/dashboard" />;
  }

  if (user.role === 'normal') {
    return <Redirect to="/dashboard" />;
  }

  const getMembershipBadge = () => {
    let variant = "outline";
    let color = "text-gray-700";
    
    switch (user.membershipPlan) {
      case "premium":
        variant = "default";
        color = "text-white";
        return (
          <Badge variant={variant as any} className="ml-2">
            Premium
          </Badge>
        );
      case "standard":
        variant = "secondary";
        color = "text-gray-900";
        return (
          <Badge variant={variant as any} className="ml-2">
            Standard
          </Badge>
        );
      default:
        return (
          <Badge variant={variant as any} className="ml-2">
            Basic
          </Badge>
        );
    }
  };
  
  const formatDate = (date: string | null) => {
    if (!date) return "N/A";
    return format(new Date(date), "PPP");
  };
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="container mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <div className="w-full md:w-64">
          <Card>
            <CardHeader>
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 mb-4">
                  <User size={48} />
                </div>
                <CardTitle className="flex items-center">
                  {user.username}
                  {getMembershipBadge()}
                </CardTitle>
                <CardDescription>{user.email}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <nav className="flex flex-col space-y-1">
                <Button
                  variant={activeTab === "profile" ? "default" : "ghost"}
                  className="justify-start"
                  onClick={() => setActiveTab("profile")}
                >
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Button>
                
                <Button
                  variant={activeTab === "settings" ? "default" : "ghost"}
                  className="justify-start"
                  onClick={() => setActiveTab("settings")}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
                
                <Button
                  variant={activeTab === "properties" ? "default" : "ghost"}
                  className="justify-start"
                  onClick={() => setActiveTab("properties")}
                >
                  <Home className="mr-2 h-4 w-4" />
                  Saved Properties
                </Button>
                
                <Button
                  variant={activeTab === "bookings" ? "default" : "ghost"}
                  className="justify-start"
                  onClick={() => setActiveTab("bookings")}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  My Bookings
                </Button>
                
                <Button
                  variant={activeTab === "notifications" ? "default" : "ghost"}
                  className="justify-start"
                  onClick={() => setActiveTab("notifications")}
                >
                  <Bell className="mr-2 h-4 w-4" />
                  Notifications
                </Button>
                
                <Button
                  variant="ghost"
                  className="justify-start text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                >
                  {logoutMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="mr-2 h-4 w-4" />
                  )}
                  Logout
                </Button>
              </nav>
            </CardContent>
          </Card>
        </div>
        
        {/* Content */}
        <div className="flex-1">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Personal Information</CardTitle>
                      <CardDescription>
                        View and manage your personal information
                      </CardDescription>
                    </div>
                    {!isEditing ? (
                      <Button variant="outline" size="sm" onClick={handleEditClick}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                          disabled={updateProfileMutation.isPending}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveEdit}
                          disabled={updateProfileMutation.isPending}
                        >
                          {updateProfileMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Save
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Full Name</h3>
                      {isEditing ? (
                        <Input
                          value={editForm.fullName}
                          onChange={(e) => handleInputChange("fullName", e.target.value)}
                          placeholder="Enter your full name"
                          className="mt-1"
                        />
                      ) : (
                        <p className="mt-1">{user.fullName}</p>
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Username</h3>
                      <p className="mt-1">{user.username}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Email</h3>
                      <p className="mt-1">{user.email}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Phone Number</h3>
                      {isEditing ? (
                        <Input
                          value={editForm.phoneNumber}
                          onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                          placeholder="Enter your phone number"
                          className="mt-1"
                        />
                      ) : (
                        <div className="mt-1 flex items-center">
                          {user.phoneNumber ? (
                            <>
                              <Phone className="mr-2 h-4 w-4 text-gray-500" />
                              <span>{user.phoneNumber}</span>
                            </>
                          ) : (
                            <span className="text-gray-400 italic">No phone number added</span>
                          )}
                        </div>
                      )}
                    </div>
                    {(user.role === 'agent' || user.role === 'admin') && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Company Name</h3>
                        {isEditing ? (
                          <Input
                            value={editForm.companyName}
                            onChange={(e) => handleInputChange("companyName", e.target.value)}
                            placeholder="Enter your company name"
                            className="mt-1"
                          />
                        ) : (
                          <p className="mt-1">{user.companyName || "Not specified"}</p>
                        )}
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Role</h3>
                      <p className="mt-1 capitalize">{user.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Membership Details</CardTitle>
                  <CardDescription>
                    Information about your current membership plan
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Current Plan</h3>
                      <p className="mt-1 capitalize">{user.membershipPlan}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Membership Start Date</h3>
                      <p className="mt-1">{formatDate(user.membershipStartDate)}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Membership End Date</h3>
                      <p className="mt-1">{formatDate(user.membershipEndDate)}</p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" className="w-full">
                    Upgrade Membership
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
            
            <TabsContent value="settings">
              <Card>
                <CardHeader>
                  <CardTitle>Account Settings</CardTitle>
                  <CardDescription>
                    Manage your account settings and preferences
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Button variant="outline">Change Password</Button>
                    <Button variant="outline">Update Email Preferences</Button>
                    <Button variant="outline">Manage Notification Settings</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="properties">
              <Card>
                <CardHeader>
                  <CardTitle>Saved Properties</CardTitle>
                  <CardDescription>
                    This feature is not available yet.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    <p>Saved properties are not available at this time.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="bookings">
              <Card>
                <CardHeader>
                  <CardTitle>My Bookings</CardTitle>
                  <CardDescription>
                    This feature is not available yet.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    <p>Bookings are not available at this time.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="notifications">
              <Card>
                <CardHeader>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>
                    This feature is not available yet.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    <p>Notifications are not available at this time.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
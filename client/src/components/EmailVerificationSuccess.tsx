import { useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

export default function EmailVerificationSuccess() {
  useEffect(() => {
    document.title = "Email Verified | RealEVR Estates";
  }, []);

  return (
    <div className="container mx-auto flex items-center justify-center min-h-screen py-16 px-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-green-900">
            Email Verified Successfully!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            Your email address has been verified. You can now log in to your RealEVR Estates account and start exploring virtual property tours.
          </p>
          <div className="space-y-2">
            <Button asChild className="w-full">
              <Link href="/auth">
                Continue to Login
              </Link>
            </Button>
            <Button variant="outline" asChild className="w-full">
              <Link href="/">
                Back to Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

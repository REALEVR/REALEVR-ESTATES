import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Home from "@/pages/Home";
import PropertyPage from "@/pages/PropertyPage";
import MembershipPage from "@/pages/MembershipPage";
import FurnishedRentalsPage from "@/pages/FurnishedRentalsPage";
import BankSalesPage from "@/pages/BankSalesPage";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/hooks/use-auth";
import { PaymentProvider } from "@/contexts/PaymentContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/property/:id" component={PropertyPage} />
      <Route path="/membership" component={MembershipPage} />
      <Route path="/furnished-rentals" component={FurnishedRentalsPage} />
      <Route path="/bank-sales" component={BankSalesPage} />
      <Route path="/rental-units" component={() => (
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-4">Rental Units</h1>
          <p className="mb-8 text-gray-600">Browse our selection of rental units across Uganda.</p>
          {/* Rental units listing will be implemented similarly to FurnishedRentalsPage */}
        </div>
      )} />
      <Route path="/for-sale" component={() => (
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-4">Properties For Sale</h1>
          <p className="mb-8 text-gray-600">Discover properties available for purchase in Uganda.</p>
          {/* Properties for sale listing will be implemented */}
        </div>
      )} />
      <Route path="/category/:categorySlug" component={() => (
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-4">Property Category</h1>
          <p className="mb-8 text-gray-600">Browse properties in this category.</p>
          {/* Generic category page */}
        </div>
      )} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PaymentProvider>
          <TooltipProvider>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-grow">
                <Router />
              </main>
              <Footer />
            </div>
            <Toaster />
          </TooltipProvider>
        </PaymentProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

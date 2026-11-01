import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Predict from "@/pages/Predict";
import Result from "@/pages/Result";
import Models from "@/pages/Models";
import Dashboard from "@/pages/Dashboard";
import About from "@/pages/About";
import Batch from "@/pages/Batch";
import Compare from "@/pages/Compare";
import Lab from "@/pages/Lab";
import Login from "@/pages/Login";
import Reports from "@/pages/Reports";
import AuthCallback from "@/pages/AuthCallback";

function AppRouter() {
  const location = useLocation();
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/predict" element={<Predict />} />
        <Route path="/result" element={<Result />} />
        <Route path="/batch" element={<Batch />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="/models" element={<Models />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/about" element={<About />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reports" element={<Reports />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </AuthProvider>
      <Toaster position="top-right" />
    </div>
  );
}

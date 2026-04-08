import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth.tsx";
import Sidebar from "@/components/Sidebar.tsx";
import Login from "@/pages/Login.tsx";
import Providers from "@/pages/Providers.tsx";
import ApiKeys from "@/pages/ApiKeys.tsx";
import Usage from "@/pages/Usage.tsx";
import Logs from "@/pages/Logs.tsx";
import Models from "@/pages/Models.tsx";
import { Loader } from "@/components/Loader.tsx";

function ProtectedLayout() {
  const { token, loading } = useAuth();

  if (loading) return <Loader />;
  if (!token) return <Navigate to='/login' replace />;

  return (
    <div className='flex h-screen bg-surface'>
      <Sidebar />
      <main
        className="flex-1 overflow-auto p-8"
        style={{
          backgroundImage: "radial-gradient(circle at 2px 2px, #dde3e9 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      >
        <Routes>
          <Route path='/' element={<Navigate to='/providers' replace />} />
          <Route path='/providers' element={<Providers />} />
          <Route path='/keys' element={<ApiKeys />} />
          <Route path='/usage' element={<Usage />} />
          <Route path='/logs' element={<Logs />} />
          <Route path='/models' element={<Models />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/login' element={<Login />} />
        <Route path='/*' element={<ProtectedLayout />} />
      </Routes>
    </BrowserRouter>
  );
}

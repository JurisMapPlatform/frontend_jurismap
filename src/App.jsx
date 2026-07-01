import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthLayout from './layouts/AuthLayout';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import NewAnalysis from './pages/NewAnalysis';
import Processing from './pages/Processing';
import History from './pages/History';
import MindMap from './pages/MindMap';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Route>

        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/analysis" element={<NewAnalysis />} />
          <Route path="/processing/:id" element={<Processing />} />
          <Route path="/history" element={<History />} />
        </Route>

        <Route path="/mindmap/:id" element={<MindMap />} />
      </Routes>
    </BrowserRouter>
  );
}

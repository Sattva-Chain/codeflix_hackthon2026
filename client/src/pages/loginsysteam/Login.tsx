"use client";
import axios from "axios";
import { useState, type ChangeEvent, type FormEvent } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { userAuth } from "../../context/Auth";
import logoUrl from "/Gemini_Generated_Image_3pferw3pferw3pfe-removebg-preview.png";

const Login = () => {
  const [activeTab, setActiveTab] = useState("organization");
  const [loading, setLoading] = useState(false);
  const { login } = userAuth()!;
  const navigate = useNavigate();

  // State Objects
  const [from, setfrom] = useState({
    emailId: "",
    CompanyURL: "",
    companyName: "",
    pass: "",
  });

  const [orgLogin, setOrgLogin] = useState({
    emailId: "",
    pass: "",
  });

  const [staffForm, setStaffForm] = useState({
    emailId: "",
    pass: "",
  });

  // ✅ Generic Change Handlers with proper types
  const handleOrgChange = (e: ChangeEvent<HTMLInputElement>) => {
    setfrom({ ...from, [e.target.name]: e.target.value });
  };

  const handleOrgLoginChange = (e: ChangeEvent<HTMLInputElement>) => {
    setOrgLogin({ ...orgLogin, [e.target.name]: e.target.value });
  };

  const handleStaffChange = (e: ChangeEvent<HTMLInputElement>) => {
    setStaffForm({ ...staffForm, [e.target.name]: e.target.value });
  };

  // ✅ Token storage helper
  const finalizeLogin = async (tokens: string) => {
    await login(tokens);
    navigate("/Dashboard2/scans");
  };

  // ✅ Organization Create Account
  const loginOrg = async (e: FormEvent) => {
    e.preventDefault();
    if (!from.emailId || !from.companyName || !from.CompanyURL || !from.pass) {
      return toast.error("Please fill all details");
    }

    setLoading(true);
    try {
      const { data } = await axios.post("http://localhost:3000/api/createAcount", from);
      if (data.success) {
        toast.success(data.message);
        await finalizeLogin(data.tokens);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error("Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Organization Login
  const handleOrgLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgLogin.emailId || !orgLogin.pass) return toast.error("Enter all fields");

    setLoading(true);
    try {
      const { data } = await axios.post("http://localhost:3000/api/orgLoginData", orgLogin);
      if (data.success) {
        toast.success(data.message);
        await finalizeLogin(data.tokens);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error("Login failed");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Staff Login
  const handleStaffLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!staffForm.emailId || !staffForm.pass) return toast.error("Enter all fields");

    setLoading(true);
    try {
      const { data } = await axios.post("http://localhost:3000/api/loginStaff", staffForm);
      if (data.success) {
        toast.success(data.message);
        await finalizeLogin(data.tokens);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error("Server Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f1724] via-[#101828] to-[#0f1724] p-6 text-gray-200">
      <Toaster position="bottom-right" />

      <div className="w-full max-w-3xl bg-white/5 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-white/10 rounded-2xl p-2">
            <img src={logoUrl} className="w-10 h-10 object-contain" alt="SecureScan logo" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">SecureScan</h1>
            <p className="text-sm text-gray-400">Authenticate to continue</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mb-6 border border-white/10 rounded-2xl overflow-hidden bg-white/5">
          {["organization", "orgLogin", "developer", "staff"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs md:text-sm font-medium transition capitalize ${
                activeTab === tab ? "bg-blue-500 text-white" : "text-gray-300 hover:bg-white/10"
              }`}
            >
              {tab === "orgLogin" ? "Org Login" : tab === "organization" ? "Create Org" : tab}
            </button>
          ))}
        </div>

        {/* Forms Container */}
        <div className="min-h-[250px]">
          {activeTab === "organization" && (
            <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={loginOrg}>
              <input type="text" name="companyName" placeholder="Company name" onChange={handleOrgChange} className="input-style" />
              <input type="url" name="CompanyURL" placeholder="https://example.com" onChange={handleOrgChange} className="input-style" />
              <input type="email" name="emailId" placeholder="Company email" onChange={handleOrgChange} className="input-style" />
              <input type="password" name="pass" placeholder="Password" onChange={handleOrgChange} className="input-style" />
              <button disabled={loading} type="submit" className="btn-primary col-span-2">
                {loading ? "Creating..." : "Create Account"}
              </button>
            </form>
          )}

          {activeTab === "orgLogin" && (
            <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleOrgLogin}>
              <input type="email" name="emailId" placeholder="Org Email" onChange={handleOrgLoginChange} className="input-style" />
              <input type="password" name="pass" placeholder="Password" onChange={handleOrgLoginChange} className="input-style" />
              <button disabled={loading} type="submit" className="btn-primary col-span-2">
                {loading ? "Logging in..." : "Login"}
              </button>
            </form>
          )}

          {activeTab === "staff" && (
            <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleStaffLogin}>
              <input type="email" name="emailId" placeholder="Staff Email" onChange={handleStaffChange} className="input-style" />
              <input type="password" name="pass" placeholder="Password" onChange={handleStaffChange} className="input-style" />
              <button disabled={loading} type="submit" className="btn-primary col-span-2">
                {loading ? "Logging in..." : "Login"}
              </button>
            </form>
          )}

          {activeTab === "developer" && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-10">
              <p>Developer gateway coming soon.</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-6 italic">SecureScan v1.0 © 2026</p>
        <button
          type="button"
          onClick={() => navigate("/Dashboard2/scans")}
          className="mt-4 w-full rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
        >
          Continue in local scan mode
        </button>
      </div>

      {/* Tailwind Component Styles */}
      <style>{`
        .input-style { @apply w-full mt-1 p-3 bg-white/10 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition; }
        .btn-primary { @apply px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-800 text-white rounded-lg w-full font-semibold transition mt-4; }
      `}</style>
    </div>
  );
};

export default Login;

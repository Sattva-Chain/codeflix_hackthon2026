"use client";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { userAuth } from "../../../context/Auth";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";

interface Employee {
  id: string;
  name: string;
  role: string;
  email: string;
  password: string;
  emailSent: boolean;
}

const ManageEmploy: React.FC = () => {
  const { company } = userAuth()!;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [role, setRole] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const navi = useNavigate();

  const COMPANY_DOMAINS = ["gmail.com", "vit.edu"]; // Allowed domains

  useEffect(() => {
    fetchMyEmployees();
  }, [company?._id]);

  const fetchMyEmployees = async () => {
    if (!company?._id) return;
    try {
      const { data } = await axios.post("http://localhost:3000/api/getmyemp", { id: company._id });
      if (data.success && Array.isArray(data.datas)) {
        setEmployees(
          data.datas.map((emp: any) => ({
            id: emp._id,
            name: emp.name || "Employee",
            role: emp.role,
            email: emp.email,
            password: emp.password,
            emailSent: true,
          }))
        );
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to fetch employees.");
    }
  };

  const toggleCredentials = (id: string) => {
    setVisibleIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email)) return false;
    const domain = email.split("@")[1];
    return COMPANY_DOMAINS.includes(domain);
  };

  const addEmployeeToList = () => {
    if (!newEmail.trim() || !newPassword.trim() || !role) {
      toast.error("Please fill in email, password, and role.");
      return;
    }
    if (!validateEmail(newEmail)) {
      toast.error(`Email must be valid and from allowed domains: ${COMPANY_DOMAINS.join(", ")}`);
      return;
    }
    const newEmp: Employee = {
      id: `temp-${Date.now()}`,
      name: `New Employee (Pending)`,
      role,
      email: newEmail,
      password: newPassword,
      emailSent: false,
    };
    setEmployees([...employees, newEmp]);
    setNewEmail("");
    setNewPassword("");
    setRole("");
    toast.success("Employee added. Click 'Create Account' to save.");
  };

  const createEmployeeAccount = async (tempId: string) => {
    const emp = employees.find(e => e.id === tempId);
    if (!emp) return;

    setLoadingIds(prev => [...prev, tempId]);

    try {
      const { data } = await axios.post("http://localhost:3000/api/createEmpy", {
        employeeEmail: emp.email,
        employeePassword: emp.password,
        employeeRole: emp.role,
        id: company?._id
      });

      if (data.success) {
        toast.success("Account created and mail sent!");
        setEmployees(prev =>
          prev.map(e => (e.id === tempId ? { ...e, emailSent: true, name: `Employee` } : e))
        );
      } else {
        toast.error(data.message || "Failed to create account.");
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Server error.");
    } finally {
      setLoadingIds(prev => prev.filter(id => id !== tempId));
    }
  };

  const deleteEmployee = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this employee?")) return;

    try {
      const { data } = await axios.post(`http://localhost:3000/api/deletetheProduct/${id}`);
      if (data.success) {
        toast.success("Employee deleted successfully!");
        setEmployees(prev => prev.filter(emp => emp.id !== id));
      } else {
        toast.error("Failed to delete employee.");
      }
    } catch (error: any) {
      console.error(error);
      toast.error("Server error while deleting employee.");
    }
  };

  return (
    <div className="min-h-screen p-8 bg-[#0B1120] text-gray-200">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1E293B', color: '#fff', border: '1px solid #334155' } }} />
      
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#1E293B]">
          <div>
            <h2 className="text-3xl font-bold text-white tracking-wide">
              Manage Employees <span className="text-[#0ae8f0]">👥</span>
            </h2>
            <p className="text-gray-400 text-sm mt-1">Add, review, and manage your organization's members</p>
          </div>
        </div>

        {/* Add New Employee Form */}
        <div className="p-8 rounded-xl bg-[#111827] border border-[#1E293B] shadow-2xl">
          <h3 className="font-bold text-lg text-white mb-6 flex items-center gap-2">
            <span className="w-2 h-6 bg-[#0ae8f0] rounded-sm block"></span>
            Provision New Employee
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="email"
              placeholder="Employee Email Address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="bg-[#0B1120] border border-[#1E293B] text-white placeholder-gray-500 rounded-lg px-4 py-3 focus:outline-none focus:border-[#0ae8f0] focus:ring-1 focus:ring-[#0ae8f0] transition-all"
            />
            <input
              type="password"
              placeholder="Temporary Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-[#0B1120] border border-[#1E293B] text-white placeholder-gray-500 rounded-lg px-4 py-3 focus:outline-none focus:border-[#0ae8f0] focus:ring-1 focus:ring-[#0ae8f0] transition-all"
            />
            <select
              onChange={(e) => setRole(e.target.value)}
              value={role}
              className="bg-[#0B1120] border border-[#1E293B] text-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-[#0ae8f0] focus:ring-1 focus:ring-[#0ae8f0] transition-all appearance-none"
            >
              <option value="" disabled>Select Department Role</option>
              <option value="UI/UX Designer">UI/UX Designer</option>
              <option value="Frontend Developer">Frontend Developer</option>
              <option value="Backend Developer">Backend Developer</option>
              <option value="Full Stack Developer">Full Stack Developer</option>
              <option value="Mobile App Developer">Mobile App Developer</option>
              <option value="DevOps Engineer">DevOps Engineer</option>
              <option value="Data Scientist">Data Scientist</option>
              <option value="Product Manager">Product Manager</option>
            </select>
            <button
              onClick={addEmployeeToList}
              className="bg-[#0ae8f0]/10 text-[#0ae8f0] border border-[#0ae8f0]/30 hover:bg-[#0ae8f0] hover:text-[#0B1120] font-semibold rounded-lg px-4 py-3 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <span>+</span> Add Employee
            </button>
          </div>
        </div>

        {/* Employee Table */}
        <div className="p-8 rounded-xl bg-[#111827] border border-[#1E293B] shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-[#1E293B]">
                  <th className="pb-4 px-4 text-gray-500 text-xs font-bold uppercase tracking-wider">Employee Name</th>
                  <th className="pb-4 px-4 text-gray-500 text-xs font-bold uppercase tracking-wider">Role</th>
                  <th className="pb-4 px-4 text-gray-500 text-xs font-bold uppercase tracking-wider">Email Address</th>
                  <th className="pb-4 px-4 text-gray-500 text-xs font-bold uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]/50">
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500 text-sm italic">
                      No employees found. Provision a new employee above.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-[#151D2C] transition-colors group">
                      <td className="py-4 px-4 text-sm font-semibold text-white">
                        {emp.name}
                        {!emp.emailSent && <span className="ml-2 text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-full uppercase tracking-wider">Pending</span>}
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-400">{emp.role}</td>
                      <td className="py-4 px-4 text-sm text-gray-300 font-mono text-xs">{emp.email}</td>
                      <td className="py-4 px-4 flex justify-end items-center gap-3">
                        <button
                          onClick={() => toggleCredentials(emp.id)}
                          className="bg-[#1E293B] hover:bg-[#2A374A] text-gray-300 border border-gray-700 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                        >
                          {visibleIds.includes(emp.id) ? "Hide Creds" : "Show Creds"}
                        </button>
                        <button
                          onClick={() => navi(`employedLogs/${emp.id}`)}
                          className="bg-[#0ae8f0]/10 hover:bg-[#0ae8f0]/20 text-[#0ae8f0] border border-[#0ae8f0]/30 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                        >
                          View Logs
                        </button>

                        {!emp.emailSent ? (
                          <button
                            onClick={() => createEmployeeAccount(emp.id)}
                            disabled={loadingIds.includes(emp.id)}
                            className="bg-green-500/10 hover:bg-green-500 text-green-400 hover:text-white border border-green-500/30 text-xs font-medium px-3 py-1.5 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed w-28 text-center"
                          >
                            {loadingIds.includes(emp.id) ? "Creating..." : "Create Account"}
                          </button>
                        ) : (
                          <button
                            onClick={() => deleteEmployee(emp.id)}
                            className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/30 text-xs font-medium px-3 py-1.5 rounded-md transition-all w-28 text-center"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Visible Credentials Section */}
          {visibleIds.length > 0 && (
            <div className="mt-8 p-6 bg-[#0B1120] rounded-lg border border-[#1E293B]">
              <h3 className="text-[#0ae8f0] text-xs font-bold uppercase tracking-widest mb-4">
                Revealed Credentials
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {employees
                  .filter(emp => visibleIds.includes(emp.id))
                  .map(emp => (
                    <div key={emp.id} className="bg-[#111827] p-4 rounded-md border border-gray-800 font-mono text-sm relative">
                      <p className="text-gray-400 mb-1">USER: <span className="text-white">{emp.email}</span></p>
                      <p className="text-gray-400 mb-2">PASS: <span className="text-[#0ae8f0]">{emp.password}</span></p>
                      <div className="absolute top-2 right-2 flex gap-2">
                        <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded uppercase tracking-wider">{emp.role}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManageEmploy;
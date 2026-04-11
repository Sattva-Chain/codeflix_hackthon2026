// EmployeeSignup.jsx
import React, { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

function EmployeeSignup() {
    const [email, setEmail] = useState("");
    const [password, setpassword] = useState("");
    const [message, setMessage] = useState("");
    const nav = useNavigate()
    const handleSignup = async (e) => {
  e.preventDefault();
  try {
    const { data } = await axios.post("http://localhost:3000/api/signup", { email, password });
    if (data.success) {
      toast.success(data.message)
      await window.electronAPI?.storeToken?.(data.tokenUser);
      nav("/");
    } else {
        toast.error(data.message)
    }
  } catch (err) {
    console.error(err);
  }
};
    return (
        <div className="flex h-screen items-center justify-center bg-gray-100">
            <div className="w-full max-w-sm rounded-2xl bg-gray-200 p-8 shadow-lg">
                <h2 className="mb-6 text-center text-2xl font-semibold text-gray-800">
                    Employee Signup
                </h2>
                <form onSubmit={handleSignup} className="space-y-4">
                    <input
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-lg border border-gray-400 px-4 py-2 text-gray-700 focus:border-gray-600 focus:outline-none"
                        required
                    />
                    <input
                        type="text"
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => setpassword(e.target.value)}
                        className="w-full rounded-lg border border-gray-400 px-4 py-2 text-gray-700 focus:border-gray-600 focus:outline-none"
                        required
                    />
                    <button
                        type="submit"
                        className="w-full rounded-lg bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-800"
                    >
                        Sign Up
                    </button>
                </form>

                {message && <p className="mt-4 text-center text-gray-600">{message}</p>}

                <p className="mt-6 text-center text-gray-700">
                    Already have an account?{" "}
                    <Link to="/login" className="font-semibold text-gray-900 hover:underline">
                        Login
                    </Link>
                </p>
            </div>
        </div>
    );
}

export default EmployeeSignup;

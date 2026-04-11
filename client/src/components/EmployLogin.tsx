// EmployeeLogin.jsx
import React, { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

function EmployeeLogin() {
    const [empId, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const nav = useNavigate()
    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const { data } = await axios.post("http://localhost:3000/api/login", { empId });
            if (data.success) {
                toast.success(data.message)
                await window.electronAPI?.storeToken?.(data.tokenUser);
                nav("/Dashboard")
                
            }
            else {
                toast.error(data.message)
            }
        } catch (err) {
            setMessage(err.response?.data?.message || "Login failed");
        }
    };

    return (
        <div className="flex h-screen items-center justify-center bg-gray-100">
            <div className="w-full max-w-sm rounded-2xl bg-gray-200 p-8 shadow-lg">
                <h2 className="mb-6 text-center text-2xl font-semibold text-gray-800">
                    Employee Login
                </h2>
                <form onSubmit={handleLogin} className="space-y-4">
                    <input
                        type="empId"
                        placeholder="Enter your empId"
                        value={empId}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-lg border border-gray-400 px-4 py-2 text-gray-700 focus:border-gray-600 focus:outline-none"
                        required
                    />

                    <button
                        type="submit"
                        className="w-full rounded-lg bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-800"
                    >
                        Login
                    </button>
                </form>

                {message && <p className="mt-4 text-center text-gray-600">{message}</p>}

                <p className="mt-6 text-center text-gray-700">
                    Don’t have an account?{" "}
                    <Link to="/singup" className="font-semibold text-gray-900 hover:underline">
                        Sign Up
                    </Link>
                </p>
            </div>
        </div>
    );
}

export default EmployeeLogin;

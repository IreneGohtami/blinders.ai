//SignupForm Component
"use client"
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { signup, isUserlogin } from "@/utils/supabase/auth";

export default function SignupForm() {
	const router = useRouter();

	useEffect(() => {
			const checkAuth = async () => {
				if (await isUserlogin()) {
					router.push('/dashboard');
				}
			};
			checkAuth();
		}, [router]);

    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        confirmPassword: ""
    });
    const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
		setIsLoading(true);

        // Basic validation
        if (!formData.firstName || !formData.lastName || !formData.email || !formData.password || !formData.confirmPassword) {
            setError("All fields are required.");
            return;
        }
		if (formData.password.length < 8) {
            setError("Password must be at least 8 characters long.");
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

		const _formData = new FormData(e.target);
		const result = await signup(_formData);
        if (result.error) {
			setError(result.error);
		}
		else if (result.redirectUrl) {
			router.push(result.redirectUrl);
		}
		else if (result.signupConfirmationEmailSent) {
			setSuccess(result.message);
		}
		else {
			setError("");
		}
		setIsLoading(false);
    };

    return (
        <div className="page-container">
            <div className="card">
                <div className={`text-center ${error ? 'mb-5' : 'mb-8'}`}>
					<h1 className="brand-title">blinders.ai</h1>
                    <h2 className="page-title">Create Account</h2>
                </div>

                {error && (
                    <div className="alert-error">
                        <p className="alert-error-text">
                            <svg className="w-6 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            {error}
                        </p>
                    </div>
                )}

				{success && (
					<div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-md">
						<p className="text-green-600 text-sm flex items-center">
							<svg className="w-6 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
								<path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
							</svg>
							{success}
						</p>
					</div>
				)}

                <form onSubmit={handleSubmit} className="form-group">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="form-label">First Name</label>
                            <input
                                type="text"
                                name="firstName"
                                className="form-input"
                                placeholder="John"
                                value={formData.firstName}
                                onChange={handleChange}
                            />
                        </div>
                        <div>
                            <label className="form-label">Last Name</label>
                            <input
                                type="text"
                                name="lastName"
                                className="form-input"
                                placeholder="Doe"
                                value={formData.lastName}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="form-label">Email</label>
                        <div className="relative rounded-md shadow-sm">
                            <div className="input-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                                </svg>
                            </div>
                            <input
                                type="email"
                                name="email"
                                className="form-input-with-icon"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="form-label">Password</label>
                        <div className="relative rounded-md shadow-sm">
                            <div className="input-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                name="password"
                                className="form-input-with-icon"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={handleChange}
                            />
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="icon-btn"
                                >
                                    {showPassword ? (
                                        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                                            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="form-label">Confirm Password</label>
                        <div className="relative rounded-md shadow-sm">
                            <div className="input-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                            </div>
                          <input
                              type={showPassword ? "text" : "password"}
                              name="confirmPassword"
                              className="form-input-with-icon"
                              placeholder="••••••••"
                              value={formData.confirmPassword}
                              onChange={handleChange}
                          />
                        </div>
                    </div>

                    <div className="flex items-center">
                        <input
                            id="terms"
                            name="terms"
                            type="checkbox"
                            className="checkbox"
                        />
                        <label htmlFor="terms" className="ml-2 block text-sm">
                            I agree to the{" "}
                            <a href="#" className="link">
                                Terms of Service
                            </a>{" "}
                            and{" "}
                            <a href="#" className="link">
                                Privacy Policy
                            </a>
                        </label>
                    </div>

                    <button
                        type="submit"
						disabled={isLoading}
                        className="btn-primary"
                    >
                        Create Account
                    </button>
                </form>

                <div className="mt-6 text-center text-sm">
                    <p>
                        Already have an account?{" "}
                        <a href="/signin" className="link">
                            Sign in
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
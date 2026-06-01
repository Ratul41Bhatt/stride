import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Shield, Lock, Mail, AlertTriangle, Play } from "lucide-react";

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Sign in to Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Fetch User document from Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        await auth.signOut();
        setError("User profile not found in database. Contact administrator.");
        setIsLoading(false);
        return;
      }

      const userData = userDoc.data();

      // 3. Verify Account is Active
      if (userData.isActive === false || userData.active === false) {
        await auth.signOut();
        setError("Account is disabled. Contact your administrator.");
        setIsLoading(false);
        return;
      }

      // 4. Verify Authorized Role (Admin or Supervisor)
      const allowedRoles = ["ADMIN", "SUPER_ADMIN", "SUPERVISOR", "COORDINATOR", "HEAD", "HR_ADMIN"];
      if (!allowedRoles.includes(userData.role)) {
        await auth.signOut();
        setError("Access Denied: Web console is restricted to Admins and Supervisors only.");
        setIsLoading(false);
        return;
      }

      // 5. Update last login audit info
      await updateDoc(userDocRef, {
        isLoggedIn: true,
        loggedIn: true,
        lastLoginAt: Date.now()
      });

      // 6. Report Success
      onLoginSuccess(userData);

    } catch (err) {
      console.error(err);
      let errMsg = "Login failed. Please check your credentials.";
      if (err.code === "auth/invalid-email") errMsg = "Invalid email address format.";
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        errMsg = "Invalid email or password.";
      }
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100vw",
      height: "100vh",
      background: "radial-gradient(circle at 50% 50%, #1e1b4b 0%, #030712 100%)",
      padding: "20px"
    }}>
      <div className="glass-card" style={{ width: "100%", maxWidth: "420px", padding: "40px 32px" }}>
        
        {/* Logo and title */}
        <div className="text-center" style={{ marginBottom: "32px" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "60px",
            height: "60px",
            borderRadius: "16px",
            background: "linear-gradient(135deg, var(--accent-violet) 0%, var(--accent-blue) 100%)",
            color: "#fff",
            marginBottom: "16px",
            boxShadow: "0 0 20px rgba(139, 92, 246, 0.4)"
          }}>
            <Shield size={32} />
          </div>
          <h2 style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "6px" }}>
            Stride Console
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            Field Force Management System
          </p>
        </div>

        {/* Error panel */}
        {error && (
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            color: "#fca5a5",
            padding: "12px 16px",
            borderRadius: "8px",
            fontSize: "13px",
            marginBottom: "24px"
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
            <span>{error}</span>
          </div>
        )}

        {/* LoginForm */}
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div style={{ position: "relative" }}>
              <Mail size={16} style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)"
              }} />
              <input
                id="email"
                type="email"
                className="form-control"
                placeholder="admin@stride.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: "42px" }}
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "28px" }}>
            <label htmlFor="password">Password</label>
            <div style={{ position: "relative" }}>
              <Lock size={16} style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)"
              }} />
              <input
                id="password"
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: "42px" }}
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", height: "46px", fontSize: "15px" }}
            disabled={isLoading}
          >
            {isLoading ? (
              <div style={{
                width: "20px",
                height: "20px",
                border: "2.5px solid rgba(255, 255, 255, 0.3)",
                borderTopColor: "#fff",
                borderRadius: "50%",
                animation: "spin 1s linear infinite"
              }} />
            ) : (
              <>
                Sign In <Play size={14} style={{ fill: "currentColor" }} />
              </>
            )}
          </button>
        </form>

        <div style={{
          textAlign: "center",
          marginTop: "24px",
          fontSize: "12px",
          color: "var(--text-muted)"
        }}>
          Authorized access only. All activities are monitored and logged.
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Login from "./components/Login";
import AdminDashboard from "./components/AdminDashboard";
import SupervisorDashboard from "./components/SupervisorDashboard";
import { Shield, AlertOctagon, LogOut } from "lucide-react";

export default function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    // Listen to Firebase Auth state
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);
      setAuthError(null);

      if (firebaseUser) {
        try {
          // Fetch user details from Firestore
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const userData = userDoc.data();
            
            // Check active status
            if (userData.isActive === false || userData.active === false) {
              await signOut(auth);
              setAuthError("Account is disabled. Please contact your administrator.");
              setUser(null);
            } else {
              setUser(userData);
            }
          } else {
            // Auto-create Admin profile if database record doesn't exist yet (first-time console user)
            const fallbackAdmin = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: firebaseUser.displayName || "System Admin",
              role: "ADMIN",
              isActive: true,
              active: true,
              createdAt: Date.now()
            };
            await updateDoc(userDocRef, fallbackAdmin).catch(async () => {
              // If write failed, just set local state
              console.log("Could not write document, setting local state");
            });
            setUser(fallbackAdmin);
          }
        } catch (err) {
          console.error("Error loading user profile:", err);
          setAuthError("Failed to retrieve user profile from Firestore.");
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // Clear Firestore login status
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        isLoggedIn: false,
        loggedIn: false,
        deviceId: null
      }).catch(err => console.log("Firestore update failed on logout: ", err));

      // Sign out from Auth
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100vw",
        height: "100vh",
        background: "#030712",
        color: "var(--text-primary)"
      }}>
        <div style={{
          width: "48px",
          height: "48px",
          border: "4px solid rgba(139, 92, 246, 0.2)",
          borderTopColor: "var(--accent-violet)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          marginBottom: "16px"
        }} />
        <h3 style={{ fontSize: "16px", fontWeight: "600", letterSpacing: "0.5px" }}>Loading Stride Console...</h3>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Auth or Role error screen
  if (authError) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100vw",
        height: "100vh",
        background: "#030712",
        padding: "20px"
      }}>
        <div className="glass-card text-center" style={{ maxWidth: "400px" }}>
          <AlertOctagon size={48} style={{ color: "var(--danger)", marginBottom: "16px" }} />
          <h2 style={{ marginBottom: "8px" }}>Authentication Error</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "24px" }}>{authError}</p>
          <button className="btn btn-primary" onClick={() => setAuthError(null)}>Back to Sign In</button>
        </div>
      </div>
    );
  }

  // Not logged in -> show login screen
  if (!user) {
    return <Login onLoginSuccess={setUser} />;
  }

  // Verify Role & Render Dashboards
  const isAdmin = ["ADMIN", "SUPER_ADMIN", "HR_ADMIN"].includes(user.role);
  const isSupervisor = ["SUPERVISOR", "COORDINATOR", "HEAD"].includes(user.role);

  if (isAdmin) {
    return (
      <div style={{ position: "relative" }}>
        <button
          onClick={handleLogout}
          className="logout-btn"
          style={{
            position: "fixed",
            right: "24px",
            top: "24px",
            width: "auto",
            zIndex: 1000,
            padding: "8px 16px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
          }}
        >
          <LogOut size={14} /> Logout
        </button>
        <AdminDashboard userProfile={user} />
      </div>
    );
  }

  if (isSupervisor) {
    return (
      <div style={{ position: "relative" }}>
        <button
          onClick={handleLogout}
          className="logout-btn"
          style={{
            position: "fixed",
            right: "24px",
            top: "24px",
            width: "auto",
            zIndex: 1000,
            padding: "8px 16px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
          }}
        >
          <LogOut size={14} /> Logout
        </button>
        <SupervisorDashboard userProfile={user} />
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100vw",
      height: "100vh",
      background: "#030712"
    }}>
      <div className="glass-card text-center" style={{ maxWidth: "420px" }}>
        <AlertOctagon size={48} style={{ color: "var(--danger)", marginBottom: "16px" }} />
        <h2 style={{ marginBottom: "8px" }}>Restricted Access</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "24px" }}>
          Your account role (<strong>{user.role}</strong>) does not have access permissions for the Stride Web Console. This console is restricted to administrators and supervisors.
        </p>
        <button className="btn btn-primary" onClick={handleLogout}>Log Out</button>
      </div>
    </div>
  );
}

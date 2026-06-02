import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import {
  collection,
  query,
  onSnapshot,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  where,
  getDocs
} from "firebase/firestore";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap
} from "react-leaflet";
import L from "leaflet";
import {
  Users,
  CheckSquare,
  FileText,
  MapPin,
  Smartphone,
  TrendingUp,
  Plus,
  Trash2,
  Check,
  X,
  Compass,
  Battery,
  AlertCircle,
  Calendar,
  MessageSquare,
  Search,
  Map,
  Menu,
  LogOut
} from "lucide-react";

// Fix Leaflet marker icons by using default leaflet asset paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png"
});

// Helper component to center Leaflet Map dynamically
function ChangeMapView({ center }) {
  const map = useMap();
  if (center) {
    map.setView(center, 14);
  }
  return null;
}

export default function SupervisorDashboard({ userProfile, handleLogout }) {
  const [activeTab, setActiveTab] = useState("team");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Close mobile menu when active tab changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeTab]);

  const [teamMembers, setTeamMembers] = useState([]);
  const [teamTasks, setTeamTasks] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [posList, setPosList] = useState([]);
  const [requests, setRequests] = useState([]);
  const [attendanceDisputes, setAttendanceDisputes] = useState([]);
  const [kpiScores, setKpiScores] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  // Sub-forms & Operations states
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedRaMap, setSelectedRaMap] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTaskLocation, setSelectedTaskLocation] = useState(null);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskPage, setTaskPage] = useState(1);

  // New Task Form State
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    type: "VISIT",
    outletId: "",
    raId: "",
    priority: "MEDIUM",
    scheduledDate: "",
    slaMinutes: 60,
    notes: "",
    posSerialNumber: ""
  });

  // Checklist items within New Task Form
  const [checklistInput, setChecklistInput] = useState("");
  const [newTaskChecklist, setNewTaskChecklist] = useState([
    { id: "cl_1", title: "Check-in at Merchant Location", isRequired: true, isCompleted: false },
    { id: "cl_2", title: "Verify POS machine operational status", isRequired: true, isCompleted: false },
    { id: "cl_3", title: "Confirm POS barcode serial matches records", isRequired: true, isCompleted: false }
  ]);

  // Alert dismissing timer
  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message, error]);

  // Load team-specific Firestore data
  useEffect(() => {
    if (!userProfile?.uid) return;

    // 1. Team Members (RAs assigned to this supervisor)
    const qUsers = query(collection(db, "users"), where("supervisorId", "==", userProfile.uid));
    const unsubTeam = onSnapshot(qUsers, (snapshot) => {
      setTeamMembers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
    });

    // 2. Outlets under this supervisor's zone (or assigned to team members)
    const unsubOutlets = onSnapshot(collection(db, "outlets"), (snapshot) => {
      setOutlets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 3. Service Requests approvals
    const unsubRequests = onSnapshot(collection(db, "service_requests"), (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 4. POS inventory assigned to team members
    const unsubPos = onSnapshot(collection(db, "pos_terminals"), (snapshot) => {
      setPosList(snapshot.docs.map(doc => ({ serial: doc.id, ...doc.data() })));
    });

    // 5. Tasks assigned by this supervisor or assigned to team members
    let unsubTasks = () => {};
    let isTasksMounted = true;
    try {
      const unsubAll = onSnapshot(collection(db, "tasks"),
        (snapshot) => {
          if (isTasksMounted) {
            setTeamTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          }
        },
        (err) => {
          if (!isTasksMounted) return;
          console.warn("Permission denied for all tasks query, falling back to supervisorId query:", err);
          const qTasks = query(collection(db, "tasks"), where("supervisorId", "==", userProfile.uid));
          const unsubFallback = onSnapshot(qTasks, (snapshot) => {
            if (isTasksMounted) {
              setTeamTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            }
          });
          unsubTasks = unsubFallback;
        }
      );
      
      const originalUnsubTasks = unsubTasks;
      unsubTasks = () => {
        unsubAll();
        originalUnsubTasks();
      };
    } catch (err) {
      console.error("Error setting up tasks snapshot:", err);
    }

    // 6. Manual attendance dispute triggers
    const unsubDisputes = onSnapshot(collection(db, "attendance_disputes"), (snapshot) => {
      setAttendanceDisputes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 7. KPI Scores
    const unsubScores = onSnapshot(collection(db, "kpi_scores"), (snapshot) => {
      setKpiScores(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      isTasksMounted = false;
      unsubTeam();
      unsubOutlets();
      unsubRequests();
      unsubPos();
      unsubTasks();
      unsubDisputes();
      unsubScores();
    };
  }, [userProfile]);

  // Operations
  const resetSession = async (userId) => {
    try {
      await updateDoc(doc(db, "users", userId), {
        isLoggedIn: false,
        loggedIn: false,
        deviceId: null
      });
      setMessage("Team member session cleared successfully.");
    } catch (err) {
      setError("Failed to clear session: " + err.message);
    }
  };

  const handleAddChecklistItem = () => {
    if (!checklistInput) return;
    setNewTaskChecklist([
      ...newTaskChecklist,
      {
        id: "cl_" + Date.now(),
        title: checklistInput,
        isRequired: true,
        isCompleted: false
      }
    ]);
    setChecklistInput("");
  };

  const handleRemoveChecklistItem = (id) => {
    setNewTaskChecklist(newTaskChecklist.filter(item => item.id !== id));
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTask.title || !newTask.outletId || !newTask.raId || !newTask.scheduledDate) {
      setError("Please fill out all required task scheduling fields.");
      return;
    }
    setIsLoading(true);

    try {
      const selectedOutlet = outlets.find(o => o.id === newTask.outletId);
      const selectedRa = teamMembers.find(t => t.uid === newTask.raId);

      const taskId = "task_" + Date.now();
      const taskData = {
        taskId: taskId,
        title: newTask.title,
        description: newTask.description,
        type: newTask.type,
        outletId: newTask.outletId,
        outletName: selectedOutlet?.name || "",
        raId: newTask.raId,
        raName: selectedRa?.name || "",
        supervisorId: userProfile.uid,
        assignedBy: userProfile.uid,
        assignedAt: Date.now(),
        scheduledDate: new Date(newTask.scheduledDate).getTime(),
        dueDate: new Date(newTask.scheduledDate).getTime() + (parseInt(newTask.slaMinutes) * 60000),
        priority: newTask.priority,
        status: "PENDING",
        checklist: newTaskChecklist,
        notes: newTask.notes,
        slaMinutes: parseInt(newTask.slaMinutes),
        isOverdue: false,
        isSynced: true,
        posSerialNumber: newTask.posSerialNumber || ""
      };

      await setDoc(doc(db, "tasks", taskId), taskData);
      setMessage(`Task "${newTask.title}" successfully assigned to ${selectedRa?.name}!`);
      setShowTaskForm(false);
      setNewTask({ title: "", description: "", type: "VISIT", outletId: "", raId: "", priority: "MEDIUM", scheduledDate: "", slaMinutes: 60, notes: "", posSerialNumber: "" });
      setNewTaskChecklist([
        { id: "cl_1", title: "Check-in at Merchant Location", isRequired: true, isCompleted: false },
        { id: "cl_2", title: "Verify POS machine operational status", isRequired: true, isCompleted: false },
        { id: "cl_3", title: "Confirm POS barcode serial matches records", isRequired: true, isCompleted: false }
      ]);
    } catch (err) {
      setError("Failed to create task: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveRequest = async (requestId, approved) => {
    try {
      const reqRef = doc(db, "service_requests", requestId);
      await updateDoc(reqRef, {
        status: approved ? "APPROVED" : "REJECTED",
        resolvedAt: Date.now(),
        resolvedBy: userProfile.uid,
        resolutionNotes: approved ? "Approved by Team Supervisor" : "Rejected by Team Supervisor"
      });
      setMessage("Service request status updated successfully.");
    } catch (err) {
      setError("Failed to process request: " + err.message);
    }
  };

  const handleApproveDispute = async (disputeId, approved) => {
    try {
      const disputeRef = doc(db, "attendance_disputes", disputeId);
      await updateDoc(disputeRef, {
        status: approved ? "APPROVED" : "REJECTED",
        resolvedAt: Date.now(),
        resolvedBy: userProfile.uid,
        notes: approved ? "Approved check-in adjustment" : "Rejected check-in adjustment"
      });
      
      // If approved, trigger user's `isCheckedIn` status to sync correctly
      if (approved) {
        const disputeDoc = attendanceDisputes.find(d => d.id === disputeId);
        if (disputeDoc?.userId) {
          await updateDoc(doc(db, "users", disputeDoc.userId), {
            isCheckedIn: true
          });
        }
      }
      setMessage("Dispute resolved successfully.");
    } catch (err) {
      setError("Failed to resolve dispute: " + err.message);
    }
  };

  // Scoped lists
  const teamMemberIds = teamMembers.map(t => t.uid);
  
  const pendingRequests = requests.filter(r => 
    teamMemberIds.includes(r.userId) && r.status === "PENDING"
  );

  const pendingDisputes = attendanceDisputes.filter(d => 
    teamMemberIds.includes(d.userId) && d.status === "PENDING"
  );

  const teamPOSList = posList.filter(pos => 
    pos.currentAssigneeId && teamMemberIds.includes(pos.currentAssigneeId)
  );

  // Determine active GPS center for Map rendering
  const validMapRAs = teamMembers.filter(m => m.lastLocation?.latitude && m.lastLocation?.longitude);
  const mapCenter = selectedRaMap 
    ? [selectedRaMap.lastLocation.latitude, selectedRaMap.lastLocation.longitude]
    : (validMapRAs.length > 0 
        ? [validMapRAs[0].lastLocation.latitude, validMapRAs[0].lastLocation.longitude] 
        : [23.8103, 90.4125]); // Default Dhaka

  return (
    <div className="app-container">
      {/* Mobile Header Top Bar */}
      <div className="mobile-header">
        <button type="button" className="menu-toggle-btn" onClick={() => setIsMobileMenuOpen(true)}>
          <Menu size={20} />
        </button>
        <div className="mobile-logo">
          <Compass size={20} style={{ color: "var(--accent-violet)" }} />
          <span>Stride Console</span>
        </div>
        <button type="button" className="logout-icon-btn" onClick={handleLogout || (() => auth.signOut())} title="Logout">
          <LogOut size={18} />
        </button>
      </div>

      {/* Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar Navigation */}
      <div className={`sidebar ${isMobileMenuOpen ? "active" : ""}`}>
        <button type="button" className="menu-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
          <X size={20} />
        </button>
        
        <div className="sidebar-logo">
          <Compass size={24} style={{ color: "var(--accent-violet)" }} />
          <span>Stride Console</span>
        </div>

        <ul className="sidebar-menu">
          <li className={`sidebar-item ${activeTab === "team" ? "active" : ""}`} onClick={() => setActiveTab("team")}>
            <Users size={16} /> <span>Team Members</span>
          </li>
          <li className={`sidebar-item ${activeTab === "tracking" ? "active" : ""}`} onClick={() => setActiveTab("tracking")}>
            <Map size={16} /> <span>Active Map Tracking</span>
          </li>
          <li className={`sidebar-item ${activeTab === "tasks" ? "active" : ""}`} onClick={() => setActiveTab("tasks")}>
            <CheckSquare size={16} /> <span>Task Assignments</span>
          </li>
          <li className={`sidebar-item ${activeTab === "approvals" ? "active" : ""}`} onClick={() => setActiveTab("approvals")}>
            <FileText size={16} /> <span>Approvals Panel</span>
          </li>
          <li className={`sidebar-item ${activeTab === "pos" ? "active" : ""}`} onClick={() => setActiveTab("pos")}>
            <Smartphone size={16} /> <span>Team POS Stock</span>
          </li>
          <li className={`sidebar-item ${activeTab === "performance" ? "active" : ""}`} onClick={() => setActiveTab("performance")}>
            <TrendingUp size={16} /> <span>KPI Scores</span>
          </li>
        </ul>

        <div className="sidebar-footer">
          <div className="user-profile-badge">
            <div className="avatar">{userProfile.name?.substring(0, 2)?.toUpperCase() || "SP"}</div>
            <div>
              <div className="user-info-name">{userProfile.name}</div>
              <div className="user-info-role">{userProfile.role}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Console Content */}
      <div className="main-content">
        {/* Banner Alert Messages */}
        {message && (
          <div className="badge badge-success mb-6" style={{ width: "100%", padding: "12px 18px", borderRadius: "10px", fontSize: "13px" }}>
            <Check size={16} style={{ marginRight: "8px" }} /> {message}
          </div>
        )}
        {error && (
          <div className="badge badge-danger mb-6" style={{ width: "100%", padding: "12px 18px", borderRadius: "10px", fontSize: "13px" }}>
            <X size={16} style={{ marginRight: "8px" }} /> {error}
          </div>
        )}

        {/* TAB 1: TEAM MEMBERS */}
        {activeTab === "team" && (
          <div>
            <div className="page-header">
              <div className="page-title">
                <h1>My Field Team</h1>
                <p>Track attendance check-in status, battery telemetry, and manage active sessions.</p>
              </div>
            </div>

            <div className="glass-card">
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Associate Name</th>
                      <th>Email</th>
                      <th>Designation</th>
                      <th>Attendance Status</th>
                      <th>System Link</th>
                      <th>Battery Telemetry</th>
                      <th>Last Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map(ra => {
                      const isOnline = ra.isCheckedIn || (Date.now() - (ra.lastLocationUpdate || 0)) < 300000;
                      return (
                        <tr key={ra.uid}>
                          <td data-label="Associate Name">
                            <div className="d-flex align-center gap-2">
                              <div className="avatar" style={{ width: "30px", height: "30px", fontSize: "11px" }}>{ra.name?.substring(0, 2)?.toUpperCase()}</div>
                              <strong>{ra.name}</strong>
                            </div>
                          </td>
                          <td data-label="Email">{ra.email}</td>
                          <td data-label="Designation">{ra.designation}</td>
                          <td data-label="Attendance Status">
                            <span className={`badge ${ra.isCheckedIn ? "badge-success" : "badge-warning"}`}>
                              {ra.isCheckedIn ? "Checked In" : "Checked Out"}
                            </span>
                          </td>
                          <td data-label="System Link">
                            <span className={`badge ${isOnline ? "badge-success" : "badge-danger"}`}>
                              {isOnline ? "ONLINE" : "OFFLINE"}
                            </span>
                          </td>
                          <td data-label="Battery Telemetry">
                            <div className="d-flex align-center gap-2">
                              <Battery size={16} style={{ color: ra.batteryLevel > 20 ? "var(--success)" : "var(--danger)" }} />
                              <span>{ra.batteryLevel}%</span>
                            </div>
                          </td>
                          <td data-label="Last Updated">
                            {ra.lastLocationUpdate ? (
                              <span style={{ fontSize: "13px" }}>{new Date(ra.lastLocationUpdate).toLocaleTimeString()}</span>
                            ) : (
                              <span style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: "13px" }}>Never</span>
                            )}
                          </td>
                          <td data-label="Actions">
                            <button className="btn btn-secondary" style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => resetSession(ra.uid)}>
                              Force Logout
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {teamMembers.length === 0 && (
                      <tr><td colSpan="8" className="text-center">No team members assigned to you.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE MAP TRACKING */}
        {activeTab === "tracking" && (
          <div>
            <div className="page-header">
              <div className="page-title">
                <h1>Live Location Telemetry</h1>
                <p>Track field force associates on a maps canvas showing live online/offline signals.</p>
              </div>
            </div>

            <div className="tab-content-grid">
              {/* RAs select cards list */}
              <div className="list-pane">
                {teamMembers.map(ra => {
                  const hasGps = ra.lastLocation?.latitude && ra.lastLocation?.longitude;
                  const isOnline = ra.isCheckedIn || (Date.now() - (ra.lastLocationUpdate || 0)) < 300000;
                  return (
                    <div
                      key={ra.uid}
                      className={`list-item-card ${selectedRaMap?.uid === ra.uid ? "active" : ""}`}
                      onClick={() => {
                        if (hasGps) {
                          setSelectedRaMap(ra);
                        } else {
                          alert(`GPS coordinates not found for ${ra.name}. Device must update location first.`);
                        }
                      }}
                      style={{ opacity: hasGps ? 1 : 0.6 }}
                    >
                      <div className="d-flex justify-between align-center mb-4">
                        <h4>{ra.name}</h4>
                        <span className={`badge ${isOnline ? "badge-success" : "badge-danger"}`}>{isOnline ? "ON" : "OFF"}</span>
                      </div>
                      <div className="d-flex align-center justify-between" style={{ fontSize: "12px" }}>
                        <div className="d-flex align-center gap-2">
                          <Battery size={14} style={{ color: ra.batteryLevel > 20 ? "var(--success)" : "var(--danger)" }} />
                          <span>{ra.batteryLevel}%</span>
                        </div>
                        {hasGps ? (
                          <span style={{ color: "var(--accent-violet)" }}>Locate on Map →</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>No GPS</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leaflet Map Box */}
              <div className="glass-card" style={{ padding: "8px", position: "relative" }}>
                {validMapRAs.length === 0 ? (
                  <div className="d-flex flex-column align-center justify-center text-center" style={{ height: "484px", color: "var(--text-muted)" }}>
                    <AlertCircle size={48} className="mb-4" />
                    <h3>No Active GPS Data Available</h3>
                    <p style={{ maxWidth: "300px", marginTop: "8px", fontSize: "13px" }}>Team members must be logged into their mobile app with location services active to stream coordinates.</p>
                  </div>
                ) : (
                  <MapContainer center={mapCenter} zoom={13} className="map-container">
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />
                    {validMapRAs.map(ra => (
                      <Marker
                        key={ra.uid}
                        position={[ra.lastLocation.latitude, ra.lastLocation.longitude]}
                      >
                        <Popup>
                          <div style={{ color: "#000", fontSize: "12px" }}>
                            <strong style={{ fontSize: "14px" }}>{ra.name}</strong><br />
                            Role: {ra.role}<br />
                            Battery: {ra.batteryLevel}%<br />
                            Attendance: {ra.isCheckedIn ? "Checked In" : "Checked Out"}<br />
                            Last update: {new Date(ra.lastLocationUpdate).toLocaleTimeString()}
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    <ChangeMapView center={selectedRaMap ? [selectedRaMap.lastLocation.latitude, selectedRaMap.lastLocation.longitude] : null} />
                  </MapContainer>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TASK ASSIGNMENTS */}
        {activeTab === "tasks" && (
          <div>
            <div className="page-header">
              <div className="page-title">
                <h1>Task Allocations</h1>
                <p>Deploy route audits, terminal repairs, or general merchant visits to team members.</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowTaskForm(!showTaskForm)}>
                <Plus size={16} /> Assign Task
              </button>
            </div>

            {showTaskForm && (
              <form onSubmit={handleCreateTask} className="glass-card mb-6 d-flex flex-column gap-4">
                <h3 className="mb-4">Schedule Task</h3>
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>Task Title</label>
                    <input type="text" className="form-control" placeholder="EBL Terminal Replacement" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>Task Classification</label>
                    <select className="form-control" value={newTask.type} onChange={e => setNewTask({...newTask, type: e.target.value})}>
                      <option value="VISIT">VISIT</option>
                      <option value="INSTALLATION">INSTALLATION</option>
                      <option value="MAINTENANCE">MAINTENANCE</option>
                      <option value="COLLECTION">COLLECTION</option>
                      <option value="AUDIT">AUDIT</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Priority</label>
                    <select className="form-control" value={newTask.priority} onChange={e => setNewTask({...newTask, priority: e.target.value})}>
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="URGENT">URGENT</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Merchant Outlet</label>
                    <select className="form-control" value={newTask.outletId} onChange={e => setNewTask({...newTask, outletId: e.target.value})} required>
                      <option value="">Select Outlet</option>
                      {outlets.map(o => (
                        <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Assignee (Retail Associate)</label>
                    <select className="form-control" value={newTask.raId} onChange={e => setNewTask({...newTask, raId: e.target.value})} required>
                      <option value="">Select Associate</option>
                      {teamMembers.map(t => (
                        <option key={t.uid} value={t.uid}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Schedule Target Date</label>
                    <input type="datetime-local" className="form-control" value={newTask.scheduledDate} onChange={e => setNewTask({...newTask, scheduledDate: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>SLA Limit (Minutes)</label>
                    <input type="number" className="form-control" value={newTask.slaMinutes} onChange={e => setNewTask({...newTask, slaMinutes: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>Device Assignment (POS Serial)</label>
                    <select className="form-control" value={newTask.posSerialNumber} onChange={e => setNewTask({...newTask, posSerialNumber: e.target.value})}>
                      <option value="">Select Device Serial (Optional)</option>
                      {posList.map(pos => (
                        <option key={pos.serial} value={pos.serialNumber}>{pos.serialNumber} ({pos.bankName})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group form-group-full">
                    <label>Deployment Instructions</label>
                    <input type="text" className="form-control" placeholder="Merchant reports keypad unresponsive on terminal..." value={newTask.notes} onChange={e => setNewTask({...newTask, notes: e.target.value})} />
                  </div>
                </div>

                {/* Subtasks checklists management */}
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-glass)", borderRadius: "10px", padding: "16px" }}>
                  <h4 style={{ fontSize: "14px", marginBottom: "12px" }}>Subtask Action Checklist</h4>
                  <div className="d-flex gap-2 mb-4">
                    <input type="text" className="form-control" placeholder="Add custom action checklist item..." value={checklistInput} onChange={e => setChecklistInput(e.target.value)} />
                    <button type="button" className="btn btn-secondary" onClick={handleAddChecklistItem}><Plus size={16} /></button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {newTaskChecklist.map(item => (
                      <div key={item.id} className="d-flex justify-between align-center" style={{ padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: "6px" }}>
                        <span style={{ fontSize: "13px" }}>{item.title}</span>
                        <Trash2 size={14} style={{ color: "var(--danger)", cursor: "pointer" }} onClick={() => handleRemoveChecklistItem(item.id)} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="d-flex gap-2">
                  <button type="submit" className="btn btn-primary" disabled={isLoading}>Assign Task</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowTaskForm(false)}>Cancel</button>
                </div>
              </form>
            )}

            <div className="glass-card">
              <div className="d-flex justify-between align-center mb-6 flex-mobile-column">
                <h3>Allocated Tasks</h3>
                <div className="mobile-w-full" style={{ position: "relative", width: "280px" }}>
                  <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input 
                    type="text" 
                    className="form-control" 
                    style={{ paddingLeft: "36px" }} 
                    placeholder="Search Serial/RA/Outlet/Title..." 
                    value={taskSearch} 
                    onChange={e => { setTaskSearch(e.target.value); setTaskPage(1); }} 
                  />
                </div>
              </div>

              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Outlet</th>
                      <th>Assignee RA</th>
                      <th>Type</th>
                      <th>Device Serial</th>
                      <th>Priority</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const teamMemberIds = teamMembers.map(t => t.uid);
                      const myTeamTasks = teamTasks.filter(task => 
                        task.supervisorId === userProfile.uid || 
                        teamMemberIds.includes(task.raId)
                      );
                      
                      const filteredTasks = myTeamTasks.filter(task => 
                        (task.title || "").toLowerCase().includes(taskSearch.toLowerCase()) ||
                        (task.outletName || "").toLowerCase().includes(taskSearch.toLowerCase()) ||
                        (task.raName || "").toLowerCase().includes(taskSearch.toLowerCase()) ||
                        (task.posSerialNumber || "").toLowerCase().includes(taskSearch.toLowerCase()) ||
                        (task.type || "").toLowerCase().includes(taskSearch.toLowerCase())
                      );
                      
                      const tasksPerPage = 10;
                      const indexOfLastTask = taskPage * tasksPerPage;
                      const indexOfFirstTask = indexOfLastTask - tasksPerPage;
                      const currentTasks = filteredTasks.slice(indexOfFirstTask, indexOfLastTask);
                      
                      return (
                        <>
                          {currentTasks.map(task => {
                            const outlet = outlets.find(o => o.id === task.outletId);
                            const outletLat = outlet?.geoPoint?.latitude;
                            const outletLng = outlet?.geoPoint?.longitude;
                            const posDevice = posList.find(p => p.serial === task.posSerialNumber || p.serialNumber === task.posSerialNumber);
                            
                            return (
                              <tr key={task.id}>
                                <td data-label="Title"><strong>{task.title}</strong></td>
                                <td data-label="Outlet">{task.outletName || task.outletId}</td>
                                <td data-label="Assignee RA">{task.raName || task.raId}</td>
                                <td data-label="Type"><span className="badge badge-info">{task.type}</span></td>
                                <td data-label="Device Serial">
                                  {task.posSerialNumber ? (
                                    <code 
                                      title={task.posSerialNumber} 
                                      style={{ 
                                        color: "var(--accent-violet)", 
                                        fontWeight: "600", 
                                        cursor: "help",
                                        whiteSpace: "nowrap"
                                      }}
                                    >
                                      {task.posSerialNumber.length > 15 
                                        ? `${task.posSerialNumber.substring(0, 12)}...` 
                                        : task.posSerialNumber}
                                    </code>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td data-label="Priority">
                                  <span className={`badge ${
                                    task.priority === "URGENT" ? "badge-danger" : 
                                    task.priority === "HIGH" ? "badge-warning" : "badge-info"
                                  }`}>{task.priority}</span>
                                </td>
                                <td data-label="Due Date">{new Date(task.dueDate || task.scheduledDate).toLocaleString()}</td>
                                <td data-label="Status">
                                  <span className={`badge ${
                                    task.status === "COMPLETED" ? "badge-success" : 
                                    task.status === "IN_PROGRESS" ? "badge-info" : "badge-warning"
                                  }`}>{task.status}</span>
                                </td>
                                <td data-label="Location">
                                  <div className="d-flex flex-column gap-1 align-end" style={{ alignItems: "flex-end" }}>
                                    {task.checkInLat && task.checkInLng && (
                                      <button 
                                        type="button"
                                        className="btn btn-secondary" 
                                        style={{ padding: "4px 8px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}
                                        onClick={() => setSelectedTaskLocation({
                                          lat: task.checkInLat,
                                          lng: task.checkInLng,
                                          title: task.title,
                                          subtitle: `Checked in by ${task.raName} at ${new Date(task.checkInAt || task.completedAt || Date.now()).toLocaleString()}`
                                        })}
                                      >
                                        <MapPin size={11} style={{ color: "var(--success)" }} /> Check-in
                                      </button>
                                    )}
                                    {posDevice?.gpsLat && posDevice?.gpsLng && (
                                      <button 
                                        type="button"
                                        className="btn btn-secondary" 
                                        style={{ padding: "4px 8px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}
                                        onClick={() => setSelectedTaskLocation({
                                          lat: posDevice.gpsLat,
                                          lng: posDevice.gpsLng,
                                          title: `POS ${posDevice.serialNumber}`,
                                          subtitle: `Last known location of POS terminal (Bank: ${posDevice.bankName || "Unknown"})`
                                        })}
                                      >
                                        <MapPin size={11} style={{ color: "var(--accent-blue)" }} /> POS Map
                                      </button>
                                    )}
                                    {outletLat && outletLng && (
                                      <button 
                                        type="button"
                                        className="btn btn-secondary" 
                                        style={{ padding: "4px 8px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content" }}
                                        onClick={() => setSelectedTaskLocation({
                                          lat: outletLat,
                                          lng: outletLng,
                                          title: task.outletName || outlet.name,
                                          subtitle: `Target Outlet location for task: ${task.title}`
                                        })}
                                      >
                                        <MapPin size={11} style={{ color: "var(--accent-violet)" }} /> Outlet Map
                                      </button>
                                    )}
                                    {!task.checkInLat && !posDevice?.gpsLat && !outletLat && (
                                      <span style={{ color: "var(--text-muted)", fontSize: "12px", fontStyle: "italic" }}>No GPS Log</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {filteredTasks.length === 0 && (
                            <tr><td colSpan="9" className="text-center">No tasks assigned yet.</td></tr>
                          )}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Decoupled Pagination Controls outside table-container */}
              {(() => {
                const teamMemberIds = teamMembers.map(t => t.uid);
                const myTeamTasks = teamTasks.filter(task => 
                  task.supervisorId === userProfile.uid || 
                  teamMemberIds.includes(task.raId)
                );
                
                const filteredTasks = myTeamTasks.filter(task => 
                  (task.title || "").toLowerCase().includes(taskSearch.toLowerCase()) ||
                  (task.outletName || "").toLowerCase().includes(taskSearch.toLowerCase()) ||
                  (task.raName || "").toLowerCase().includes(taskSearch.toLowerCase()) ||
                  (task.posSerialNumber || "").toLowerCase().includes(taskSearch.toLowerCase()) ||
                  (task.type || "").toLowerCase().includes(taskSearch.toLowerCase())
                );
                
                const tasksPerPage = 10;
                const totalTaskPages = Math.ceil(filteredTasks.length / tasksPerPage);
                const indexOfLastTask = taskPage * tasksPerPage;
                const indexOfFirstTask = indexOfLastTask - tasksPerPage;
                
                if (totalTaskPages <= 1) return null;
                
                return (
                  <div className="d-flex justify-between align-center mt-4 flex-wrap gap-2" style={{ width: "100%", padding: "8px 0" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                      Showing {indexOfFirstTask + 1} - {Math.min(indexOfLastTask, filteredTasks.length)} of {filteredTasks.length} tasks
                    </span>
                    <div className="d-flex gap-2">
                      <button 
                        type="button"
                        className="btn btn-secondary" 
                        style={{ padding: "6px 12px", fontSize: "12px" }}
                        disabled={taskPage === 1}
                        onClick={() => setTaskPage(prev => Math.max(1, prev - 1))}
                      >
                        Previous
                      </button>
                      <span style={{ fontSize: "13px", fontWeight: "600", alignSelf: "center", color: "var(--text-secondary)" }}>
                        Page {taskPage} of {totalTaskPages}
                      </span>
                      <button 
                        type="button"
                        className="btn btn-secondary" 
                        style={{ padding: "6px 12px", fontSize: "12px" }}
                        disabled={taskPage === totalTaskPages}
                        onClick={() => setTaskPage(prev => Math.min(totalTaskPages, prev + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* TAB 4: APPROVALS PANEL */}
        {activeTab === "approvals" && (
          <div>
            <div className="page-header">
              <div className="page-title">
                <h1>Pending Approvals</h1>
                <p>Review leave applications, TA/DA expense sheets, and manual check-in disputes.</p>
              </div>
            </div>

            {/* Sub-panel 1: Service Requests */}
            <div className="glass-card mb-6">
              <h3 className="mb-4">Leaves & Expenses Reimbursements</h3>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Team Member</th>
                      <th>Claim Type</th>
                      <th>Timeline</th>
                      <th>Reason / Route details</th>
                      <th>Amount</th>
                      <th>Approve Decisions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map(req => {
                      const user = teamMembers.find(t => t.uid === req.userId);
                      return (
                        <tr key={req.id}>
                          <td data-label="Team Member"><strong>{user?.name || req.userId}</strong></td>
                          <td data-label="Claim Type"><span className="badge badge-info">{req.type}</span></td>
                          <td data-label="Timeline">
                            {req.type === "LEAVE" ? `${req.startDate} to ${req.endDate} (${req.days} days)` : req.expenseDate}
                          </td>
                          <td data-label="Reason / Route details" style={{ maxWidth: "250px" }}>
                            <span>{req.reason}</span>
                            {req.type === "TA_CLAIM" && (
                              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                                {req.fromLocation} → {req.toLocation} ({req.distanceKm} km)
                              </div>
                            )}
                          </td>
                          <td data-label="Amount">{req.amount > 0 ? `$${req.amount}` : "—"}</td>
                          <td data-label="Approve Decisions">
                            <div className="d-flex gap-2">
                              <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "13px" }} onClick={() => handleApproveRequest(req.id, true)}>
                                Approve
                              </button>
                              <button className="btn btn-danger" style={{ padding: "6px 12px", fontSize: "13px" }} onClick={() => handleApproveRequest(req.id, false)}>
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {pendingRequests.length === 0 && (
                      <tr><td colSpan="6" className="text-center">No pending leave or expense requests.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sub-panel 2: Attendance Disputes */}
            <div className="glass-card">
              <h3 className="mb-4">Attendance Check-in Disputes</h3>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Team Member</th>
                      <th>Disputed Date</th>
                      <th>Check-in Location (Disputed)</th>
                      <th>Dispute Reason</th>
                      <th>Approve Decisions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingDisputes.map(disp => {
                      const user = teamMembers.find(t => t.uid === disp.userId);
                      return (
                        <tr key={disp.id}>
                          <td data-label="Team Member"><strong>{user?.name || disp.userId}</strong></td>
                          <td data-label="Disputed Date">{disp.date}</td>
                          <td data-label="Check-in Location (Disputed)">{disp.checkInLocationName || `${disp.lat}, ${disp.lng}`}</td>
                          <td data-label="Dispute Reason">{disp.reason}</td>
                          <td data-label="Approve Decisions">
                            <div className="d-flex gap-2">
                              <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "13px" }} onClick={() => handleApproveDispute(disp.id, true)}>
                                Adjust Check-in
                              </button>
                              <button className="btn btn-danger" style={{ padding: "6px 12px", fontSize: "13px" }} onClick={() => handleApproveDispute(disp.id, false)}>
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {pendingDisputes.length === 0 && (
                      <tr><td colSpan="5" className="text-center">No pending attendance check-in disputes.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: TEAM POS STOCK */}
        {activeTab === "pos" && (
          <div>
            <div className="page-header">
              <div className="page-title">
                <h1>Assigned POS Inventory</h1>
                <p>Track terminal serial numbers currently carrying by your field associates.</p>
              </div>
            </div>

            <div className="glass-card">
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Serial Number</th>
                      <th>Current Assignee</th>
                      <th>Bank Name</th>
                      <th>Branch Name</th>
                      <th>Inventory Status</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamPOSList.map(pos => {
                      const assignee = teamMembers.find(t => t.uid === pos.currentAssigneeId);
                      return (
                        <tr key={pos.serial}>
                          <td data-label="Serial Number"><strong style={{ color: "var(--accent-violet)" }}>{pos.serialNumber}</strong></td>
                          <td data-label="Current Assignee"><strong>{assignee?.name || pos.currentAssigneeId}</strong></td>
                          <td data-label="Bank Name">{pos.bankName}</td>
                          <td data-label="Branch Name">{pos.branchName}</td>
                          <td data-label="Inventory Status">
                            <span className="badge badge-success">{pos.status}</span>
                          </td>
                          <td data-label="Location">
                            {pos.gpsLat && pos.gpsLng ? (
                              <button 
                                type="button"
                                className="btn btn-secondary" 
                                style={{ padding: "6px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                                onClick={() => setSelectedTaskLocation({
                                  lat: pos.gpsLat,
                                  lng: pos.gpsLng,
                                  title: `POS ${pos.serialNumber}`,
                                  subtitle: `Deployed at: ${pos.merchantName || "Merchant Location"} (Partner Bank: ${pos.bankName})`
                                })}
                              >
                                <MapPin size={12} style={{ color: "var(--success)" }} /> View GPS
                              </button>
                            ) : (
                              <span style={{ color: "var(--text-muted)", fontSize: "13px", fontStyle: "italic" }}>No GPS Log</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {teamPOSList.length === 0 && (
                      <tr><td colSpan="6" className="text-center">No POS terminals currently assigned to your team members.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: PERFORMANCE / KPI SCORES */}
        {activeTab === "performance" && (
          <div>
            <div className="page-header">
              <div className="page-title">
                <h1>Team KPI Scorecard</h1>
                <p>View calculated monthly scores, actual progress against metrics, and rankings.</p>
              </div>
            </div>

            <div className="glass-card">
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Associate Name</th>
                      <th>KPI Score Period</th>
                      <th>Target Metric</th>
                      <th>Actual Value achieved</th>
                      <th>Total Score Index</th>
                      <th>Compliance Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiScores.filter(s => teamMemberIds.includes(s.userId)).map(score => {
                      const user = teamMembers.find(t => t.uid === score.userId);
                      return (
                        <tr key={score.id}>
                          <td data-label="Associate Name"><strong>{user?.name || score.userId}</strong></td>
                          <td data-label="KPI Score Period"><span className="badge badge-info">{score.period}</span></td>
                          <td data-label="Target Metric">{score.target}</td>
                          <td data-label="Actual Value achieved">{score.actual}</td>
                          <td data-label="Total Score Index"><strong>{score.score}</strong></td>
                          <td data-label="Compliance Grade">
                            <span className={`badge ${
                              score.achievement >= 90 ? "badge-success" : 
                              score.achievement >= 75 ? "badge-info" : "badge-warning"
                            }`}>{score.achievement}% achieved</span>
                          </td>
                        </tr>
                      );
                    })}
                    {kpiScores.filter(s => teamMemberIds.includes(s.userId)).length === 0 && (
                      <tr><td colSpan="6" className="text-center">No calculated KPI score sheets found for your team.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Modal Map overlay Dialog */}
        {selectedTaskLocation && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px"
          }}>
            <div className="glass-card" style={{ width: "100%", maxWidth: "600px", position: "relative", border: "1px solid rgba(139, 92, 246, 0.3)" }}>
              <button 
                type="button"
                onClick={() => setSelectedTaskLocation(null)}
                className="btn btn-secondary" 
                style={{ position: "absolute", top: "16px", right: "16px", padding: "6px 10px", borderRadius: "50%", zIndex: 10000 }}
              >
                <X size={16} />
              </button>
              <h3 className="mb-4" style={{ paddingRight: "30px" }}>{selectedTaskLocation.title}</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "16px" }}>{selectedTaskLocation.subtitle}</p>
              <div style={{ height: "350px", width: "100%", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--border-glass)" }}>
                <MapContainer center={[selectedTaskLocation.lat, selectedTaskLocation.lng]} zoom={15} style={{ height: "100%", width: "100%" }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  />
                  <Marker position={[selectedTaskLocation.lat, selectedTaskLocation.lng]}>
                    <Popup>
                      <div style={{ color: "#000" }}>
                        <strong>{selectedTaskLocation.title}</strong><br />
                        {selectedTaskLocation.subtitle}
                      </div>
                    </Popup>
                  </Marker>
                </MapContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

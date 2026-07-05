import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  collection, doc, query, where, onSnapshot,
  addDoc, setDoc, serverTimestamp, getDocs, orderBy, limit,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useTheme } from "../../contexts/ThemeContext";

// ── Category config ──────────────────────────────────────────────────────────
const CATS: Record<string, { icon: string; label: string; color: string }> = {
  general:     { icon: "📢", label: "General",      color: "#6B7280" },
  alert:       { icon: "🚨", label: "Urgent Alert",  color: "#EF4444" },
  info:        { icon: "💡", label: "Info",           color: "#3B82F6" },
  maintenance: { icon: "🔧", label: "Maintenance",   color: "#F59E0B" },
  event:       { icon: "🎉", label: "Event",          color: "#8B5CF6" },
  payment:     { icon: "💰", label: "Payment",        color: "#10B981" },
  update:      { icon: "📣", label: "Update",         color: "#EC4899" },
};

type CatKey = keyof typeof CATS;

type TargetMode = "all" | "cooperative" | "driver" | "commuter" | "specific";

interface UserOption { uid: string; displayName?: string; coopName?: string; email?: string; role: string; }
interface Announcement {
  id: string; title: string; body: string; category: CatKey;
  createdBy: string; createdByName: string; createdByRole: string;
  targetAudience: TargetMode; targetCoopId?: string;
  targetUserIds?: string[]; targetUserNames?: string[];
  createdAt: any;
}

// ── Portal Modal Wrapper ─────────────────────────────────────────────────────
const Modal: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) =>
  createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,0.82)", backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        animation: "slideUpFade 0.18s ease-out",
      }}
    >
      {children}
    </div>,
    document.body
  );

// ── Label ─────────────────────────────────────────────────────────────────────
const Lbl: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = "#6B7280" }) => (
  <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color, marginBottom: 8 }}>
    {children}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
const AnnouncementBell: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<Announcement | null>(null);
  const [composing, setComposing] = useState(false);

  // Compose form state
  const [catKey, setCatKey] = useState<CatKey>("general");
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // Specific-user picker state
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserOption[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [userSearching, setUserSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const ref = useRef<HTMLDivElement>(null);
  const role: string = userData?.role || "commuter";
  const uid: string = userData?.uid || "";
  const canCompose = role === "admin" || role === "cooperative";

  // ── Theme tokens ────────────────────────────────────────────────────────────
  const roleAccent = role === "driver" ? "#FF6B00" : role === "cooperative" ? "#10B981" : "#3B82F6";
  const bg        = dark ? "#0D0E14"               : "#ffffff";
  const cardBg    = dark ? "#111320"               : "#F8FAFC";
  const bdr       = dark ? "rgba(255,255,255,0.08)": "#E5E7EB";
  const prim      = dark ? "#F1F2F6"               : "#111827";
  const sec       = dark ? "#9CA3AF"               : "#6B7280";
  const faint     = dark ? "#374151"               : "#E5E7EB";

  const card = (w = 520): React.CSSProperties => ({
    background: bg, border: `1px solid ${bdr}`, borderRadius: 28,
    maxWidth: w, width: "100%", overflow: "hidden",
    boxShadow: "0 32px 100px rgba(0,0,0,0.55)",
    maxHeight: "92vh", display: "flex", flexDirection: "column",
  });
  const inp: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 12,
    border: `1px solid ${bdr}`, background: dark ? "rgba(255,255,255,0.05)" : "#F3F4F6",
    color: prim, fontSize: 13, fontWeight: 600, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };
  const chipBtn = (active: boolean, color: string): React.CSSProperties => ({
    padding: "6px 11px", borderRadius: 10,
    border: `1px solid ${active ? color : bdr}`,
    background: active ? `${color}18` : "transparent",
    color: active ? color : sec, fontSize: 11, fontWeight: 700,
    cursor: "pointer", transition: "all 0.14s",
    display: "flex", alignItems: "center", gap: 4,
  });

  // ── Close dropdown on outside click ────────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Fetch announcements ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    const roleTarget =
      role === "cooperative" ? "cooperative" :
      role === "driver"      ? "driver"      :
      role === "admin"       ? "all"         : "commuter";

    const merged = new Map<string, Announcement>();
    const apply = () => {
      const visible = Array.from(merged.values()).filter((a) => {
        if (a.targetAudience === "specific") {
          return a.targetUserIds?.includes(uid);
        }
        if (a.targetAudience === "driver" && a.targetCoopId) {
          return role === "driver" && userData?.cooperativeId === a.targetCoopId;
        }
        return true;
      });
      visible.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setAnnouncements(visible);
    };

    const unsubs: (() => void)[] = [];

    // Broadcast + role-specific
    unsubs.push(onSnapshot(
      query(collection(db, "announcements"), where("targetAudience", "in", ["all", roleTarget])),
      (snap) => { snap.docs.forEach((d) => merged.set(d.id, { id: d.id, ...d.data() } as Announcement)); apply(); },
      console.warn
    ));

    // Specific-user targeting
    unsubs.push(onSnapshot(
      query(collection(db, "announcements"), where("targetAudience", "==", "specific"), where("targetUserIds", "array-contains", uid)),
      (snap) => { snap.docs.forEach((d) => merged.set(d.id, { id: d.id, ...d.data() } as Announcement)); apply(); },
      console.warn
    ));

    // Coop → own drivers
    if (role === "driver" && userData?.cooperativeId) {
      unsubs.push(onSnapshot(
        query(collection(db, "announcements"), where("targetAudience", "==", "driver"), where("targetCoopId", "==", userData.cooperativeId)),
        (snap) => { snap.docs.forEach((d) => merged.set(d.id, { id: d.id, ...d.data() } as Announcement)); apply(); },
        console.warn
      ));
    }

    return () => unsubs.forEach((u) => u());
  }, [uid, role, userData?.cooperativeId]);

  // ── Fetch reads ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, "announcement_reads"), where("userId", "==", uid)),
      (snap) => setReadIds(new Set(snap.docs.map((d) => d.data().announcementId as string))),
      console.warn
    );
  }, [uid]);

  const markRead = async (ann: Announcement) => {
    if (!uid || readIds.has(ann.id)) return;
    try {
      await setDoc(doc(db, "announcement_reads", `${uid}_${ann.id}`), {
        userId: uid, announcementId: ann.id, readAt: serverTimestamp(),
      });
    } catch (e) { console.warn(e); }
  };

  const openAnn = (ann: Announcement) => {
    markRead(ann); setViewing(ann); setOpen(false);
  };

  // ── User search for specific targeting ──────────────────────────────────────
  useEffect(() => {
    if (targetMode !== "specific" || userSearch.trim().length < 2) {
      setUserResults([]); return;
    }
    setUserSearching(true);
    const term = userSearch.toLowerCase();

    // For cooperative: search only their drivers
    const baseQuery = role === "cooperative"
      ? query(collection(db, "users"), where("role", "==", "driver"), where("cooperativeId", "==", uid), limit(20))
      : query(collection(db, "users"), limit(40));

    getDocs(baseQuery).then((snap) => {
      const results: UserOption[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        const name = (data.displayName || data.coopName || data.email || "").toLowerCase();
        const email = (data.email || "").toLowerCase();
        if (name.includes(term) || email.includes(term)) {
          results.push({ uid: d.id, displayName: data.displayName, coopName: data.coopName, email: data.email, role: data.role });
        }
      });
      setUserResults(results.filter((u) => u.uid !== uid));
      setUserSearching(false);
    }).catch(() => setUserSearching(false));
  }, [userSearch, targetMode, uid, role]);

  const toggleUser = (u: UserOption) => {
    setSelectedUsers((prev) =>
      prev.find((x) => x.uid === u.uid) ? prev.filter((x) => x.uid !== u.uid) : [...prev, u]
    );
  };

  // ── Compose ─────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setTitle(""); setBody(""); setCatKey("general");
    setTargetMode(role === "cooperative" ? "driver" : "all");
    setUserSearch(""); setSelectedUsers([]); setUserResults([]);
  };

  const handleCompose = async () => {
    if (!title.trim() || !body.trim()) return alert("Please fill in the title and message.");
    if (targetMode === "specific" && selectedUsers.length === 0) return alert("Please select at least one recipient.");
    setSaving(true);
    try {
      const data: any = {
        title: title.trim(), body: body.trim(), category: catKey,
        createdBy: uid,
        createdByName: userData?.displayName || userData?.coopName || "System",
        createdByRole: role,
        targetAudience: role === "cooperative" && targetMode !== "specific" ? "driver" : targetMode,
        createdAt: serverTimestamp(),
      };
      if (role === "cooperative" && targetMode !== "specific") data.targetCoopId = uid;
      if (targetMode === "specific") {
        data.targetUserIds = selectedUsers.map((u) => u.uid);
        data.targetUserNames = selectedUsers.map((u) => u.displayName || u.coopName || u.email || u.uid);
      }
      await addDoc(collection(db, "announcements"), data);
      resetForm(); setComposing(false);
      alert("Announcement published!");
    } catch (e: any) {
      alert("Failed: " + (e.message || e));
    } finally { setSaving(false); }
  };

  const unreadCount = announcements.filter((a) => !readIds.has(a.id)).length;

  const fmtTime = (ts: any) => {
    const d = ts?.toDate?.(); if (!d) return "";
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const fmtFull = (ts: any) => {
    const d = ts?.toDate?.(); if (!d) return "";
    return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // ── Admin target options ─────────────────────────────────────────────────────
  const adminTargets: [TargetMode, string, string][] =
    role === "cooperative"
      ? [["driver", "🛺", "My Drivers"], ["specific", "👤", "Specific User"]]
      : [["all", "🌐", "All Users"], ["cooperative", "🏢", "Cooperatives"], ["driver", "🛺", "Drivers"], ["commuter", "💳", "Commuters"], ["specific", "👤", "Specific User"]];

  return (
    <div ref={ref} style={{ position: "relative" }}>

      {/* ── Bell Button ─────────────────────────────────────────────────────── */}
      <button
        onClick={() => { setOpen((v) => !v); }}
        aria-label="Announcements"
        style={{
          position: "relative", width: 36, height: 36, borderRadius: 12,
          background: open ? (dark ? "rgba(255,255,255,0.07)" : "#F0F0F0") : "none",
          border: `1px solid ${bdr}`, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: unreadCount > 0 ? prim : sec, transition: "all 0.2s",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            background: "#EF4444", color: "#fff",
            fontSize: 9, fontWeight: 900, minWidth: 16, height: 16,
            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px", border: `2px solid ${dark ? "#0D0E14" : "#fff"}`,
            animation: "aranovapulse 2s infinite",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown ────────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 10px)", right: 0,
          width: 350, background: bg, border: `1px solid ${bdr}`,
          borderRadius: 20, zIndex: 9000, overflow: "hidden",
          boxShadow: dark ? "0 24px 70px rgba(0,0,0,0.75)" : "0 16px 50px rgba(0,0,0,0.13)",
          animation: "slideUpFade 0.18s ease-out",
        }}>
          {/* Dropdown header */}
          <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${bdr}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 14, color: prim }}>Announcements</div>
              <div style={{ fontSize: 10, color: unreadCount > 0 ? "#EF4444" : sec, fontWeight: 700, marginTop: 2 }}>
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up ✓"}
              </div>
            </div>
            {canCompose && (
              <button
                onClick={() => { setComposing(true); setOpen(false); resetForm(); }}
                style={{
                  background: roleAccent, color: "#fff", border: "none",
                  borderRadius: 10, padding: "7px 14px", fontSize: 10,
                  fontWeight: 900, cursor: "pointer", textTransform: "uppercase",
                  letterSpacing: "0.06em", transition: "opacity 0.2s",
                }}
              >
                + Post
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {announcements.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: sec }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>No announcements</div>
                <div style={{ fontSize: 11, marginTop: 4, color: faint }}>Nothing posted yet</div>
              </div>
            ) : announcements.map((ann) => {
              const cat = CATS[ann.category] || CATS.general;
              const isRead = readIds.has(ann.id);
              return (
                <button
                  key={ann.id}
                  onClick={() => openAnn(ann)}
                  style={{
                    width: "100%", textAlign: "left", padding: "13px 18px",
                    background: "transparent", border: "none",
                    borderBottom: `1px solid ${bdr}`,
                    borderLeft: isRead ? `3px solid transparent` : `3px solid ${cat.color}`,
                    cursor: "pointer", transition: "background 0.15s", display: "block",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "rgba(255,255,255,0.04)" : "#F9FAFB")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: `${cat.color}15`, border: `1px solid ${cat.color}25`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                    }}>
                      {cat.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                        <span style={{ fontWeight: isRead ? 600 : 900, fontSize: 13, color: prim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ann.title}
                        </span>
                        {!isRead && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#EF4444", flexShrink: 0 }} />}
                      </div>
                      <div style={{ fontSize: 11, color: sec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                        {ann.body}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.07em", color: cat.color, background: `${cat.color}15`, padding: "2px 7px", borderRadius: 5 }}>
                          {cat.label}
                        </span>
                        <span style={{ fontSize: 10, color: sec }}>{fmtTime(ann.createdAt)}</span>
                        <span style={{ fontSize: 10, color: isRead ? "#10B981" : sec, marginLeft: "auto", fontWeight: isRead ? 700 : 400 }}>
                          {isRead ? "✓ Read" : "Tap →"}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── View Modal ──────────────────────────────────────────────────────── */}
      {viewing && (
        <Modal onClose={() => setViewing(null)}>
          <div style={card(540)}>
            {/* Category color bar */}
            <div style={{ height: 4, flexShrink: 0, background: `linear-gradient(90deg, ${(CATS[viewing.category] || CATS.general).color}, ${(CATS[viewing.category] || CATS.general).color}55)` }} />

            {/* Scrollable body */}
            <div style={{ overflowY: "auto", padding: 28 }}>
              {/* Category + Title */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 22 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16, flexShrink: 0,
                  background: `${(CATS[viewing.category] || CATS.general).color}15`,
                  border: `1px solid ${(CATS[viewing.category] || CATS.general).color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
                }}>
                  {(CATS[viewing.category] || CATS.general).icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: (CATS[viewing.category] || CATS.general).color, marginBottom: 5 }}>
                    {(CATS[viewing.category] || CATS.general).label}
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: prim, margin: 0, lineHeight: 1.3, wordBreak: "break-word" }}>
                    {viewing.title}
                  </h2>
                </div>
              </div>

              {/* Body */}
              <div style={{
                fontSize: 14, color: dark ? "#CBD5E1" : "#374151",
                lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word",
                background: cardBg, border: `1px solid ${bdr}`,
                borderRadius: 16, padding: "18px 20px", marginBottom: 20,
              }}>
                {viewing.body}
              </div>

              {/* Specific recipients row */}
              {viewing.targetUserNames && viewing.targetUserNames.length > 0 && (
                <div style={{
                  padding: "10px 14px", borderRadius: 12, marginBottom: 16,
                  background: dark ? "rgba(59,130,246,0.08)" : "#EFF6FF",
                  border: `1px solid ${dark ? "rgba(59,130,246,0.2)" : "#BFDBFE"}`,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", color: "#3B82F6", letterSpacing: "0.08em", marginBottom: 5 }}>
                    👤 Sent to specific users
                  </div>
                  <div style={{ fontSize: 11, color: dark ? "#93C5FD" : "#1D4ED8", fontWeight: 600 }}>
                    {viewing.targetUserNames.join(", ")}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingTop: 16, borderTop: `1px solid ${bdr}` }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: prim }}>{viewing.createdByName}</div>
                  <div style={{ fontSize: 10, color: sec, marginTop: 3 }}>
                    {viewing.createdByRole === "admin" ? "🔒 System Administrator" : viewing.createdByRole === "cooperative" ? "🏢 Cooperative" : ""}{" · "}{fmtFull(viewing.createdAt)}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em",
                      padding: "3px 9px", borderRadius: 6,
                      color: readIds.has(viewing.id) ? "#10B981" : "#EF4444",
                      background: readIds.has(viewing.id) ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                    }}>
                      {readIds.has(viewing.id) ? "✓ Read" : "● New"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setViewing(null)}
                  style={{
                    flexShrink: 0, padding: "10px 22px", borderRadius: 12,
                    background: dark ? "rgba(255,255,255,0.07)" : "#F3F4F6",
                    border: `1px solid ${bdr}`, color: prim,
                    fontWeight: 900, fontSize: 11, cursor: "pointer",
                    textTransform: "uppercase", letterSpacing: "0.07em",
                    transition: "all 0.2s",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Compose Modal ───────────────────────────────────────────────────── */}
      {composing && (
        <Modal onClose={() => setComposing(false)}>
          <div style={card(500)}>
            {/* Accent top bar */}
            <div style={{ height: 3, flexShrink: 0, background: `linear-gradient(90deg, ${roleAccent}, ${roleAccent}55)` }} />

            {/* Header */}
            <div style={{ padding: "22px 26px 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: `1px solid ${bdr}`, flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 900, color: prim, margin: 0 }}>Post Announcement</h2>
                <p style={{ fontSize: 11, color: sec, marginTop: 4, margin: "4px 0 0" }}>
                  {role === "cooperative" ? "Broadcast to your drivers or specific members" : "Broadcast to Aranova users"}
                </p>
              </div>
              <button onClick={() => setComposing(false)} style={{ background: "none", border: "none", cursor: "pointer", color: sec, fontSize: 22, lineHeight: 1, padding: 0 }}>✕</button>
            </div>

            {/* Scrollable form body */}
            <div style={{ overflowY: "auto", padding: "20px 26px 24px", display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Category */}
              <div>
                <Lbl color={sec}>Category</Lbl>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {Object.entries(CATS).map(([key, cat]) => (
                    <button key={key} onClick={() => setCatKey(key as CatKey)} style={chipBtn(catKey === key, cat.color)}>
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Audience */}
              <div>
                <Lbl color={sec}>Send To</Lbl>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {adminTargets.map(([val, icon, label]) => (
                    <button key={val} onClick={() => { setTargetMode(val); setSelectedUsers([]); setUserSearch(""); }} style={chipBtn(targetMode === val, roleAccent)}>
                      {icon} {label}
                    </button>
                  ))}
                </div>

                {/* Cooperative driver-only notice */}
                {role === "cooperative" && targetMode === "driver" && (
                  <div style={{ marginTop: 8, padding: "9px 12px", borderRadius: 10, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", fontSize: 11, color: "#34D399", fontWeight: 700 }}>
                    🛺 Visible only to your registered drivers
                  </div>
                )}

                {/* Specific user picker */}
                {targetMode === "specific" && (
                  <div style={{ marginTop: 12 }}>
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder={role === "cooperative" ? "Search your drivers by name…" : "Search users by name or email…"}
                      style={inp}
                    />

                    {/* Selected users chips */}
                    {selectedUsers.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                        {selectedUsers.map((u) => (
                          <div key={u.uid} style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "5px 10px", borderRadius: 20,
                            background: `${roleAccent}18`, border: `1px solid ${roleAccent}30`,
                            fontSize: 11, fontWeight: 700, color: roleAccent,
                          }}>
                            {u.role === "driver" ? "🛺" : u.role === "cooperative" ? "🏢" : "💳"}
                            {u.displayName || u.coopName || u.email || u.uid}
                            <button
                              onClick={() => toggleUser(u)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: roleAccent, fontSize: 14, lineHeight: 1, padding: 0 }}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Search results */}
                    {userSearch.length >= 2 && (
                      <div style={{
                        marginTop: 6, borderRadius: 12, border: `1px solid ${bdr}`,
                        background: bg, overflow: "hidden", maxHeight: 180, overflowY: "auto",
                      }}>
                        {userSearching ? (
                          <div style={{ padding: "16px", textAlign: "center", color: sec, fontSize: 12 }}>Searching…</div>
                        ) : userResults.length === 0 ? (
                          <div style={{ padding: "16px", textAlign: "center", color: sec, fontSize: 12 }}>No users found</div>
                        ) : userResults.map((u) => {
                          const isSelected = selectedUsers.some((x) => x.uid === u.uid);
                          return (
                            <button
                              key={u.uid}
                              onClick={() => toggleUser(u)}
                              style={{
                                width: "100%", textAlign: "left", padding: "10px 14px",
                                border: "none", borderBottom: `1px solid ${bdr}`,
                                background: isSelected ? `${roleAccent}10` : "transparent",
                                color: prim, cursor: "pointer", display: "flex",
                                alignItems: "center", gap: 8, transition: "background 0.1s",
                              }}
                              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = dark ? "rgba(255,255,255,0.04)" : "#F9FAFB"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? `${roleAccent}10` : "transparent"; }}
                            >
                              <div style={{
                                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                                background: `${roleAccent}15`, border: `1px solid ${roleAccent}25`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 12, fontWeight: 900, color: roleAccent,
                              }}>
                                {(u.displayName || u.coopName || "?").charAt(0).toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: prim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {u.displayName || u.coopName || u.email}
                                </div>
                                <div style={{ fontSize: 10, color: sec }}>
                                  {u.role === "driver" ? "🛺 Driver" : u.role === "cooperative" ? "🏢 Cooperative" : "💳 Commuter"}
                                  {u.email ? ` · ${u.email}` : ""}
                                </div>
                              </div>
                              {isSelected && <span style={{ color: roleAccent, fontWeight: 900, fontSize: 14 }}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Title */}
              <div>
                <Lbl color={sec}>Title</Lbl>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short, clear title…" style={inp} />
              </div>

              {/* Message */}
              <div>
                <Lbl color={sec}>Message</Lbl>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your announcement here…"
                  rows={5}
                  style={{ ...inp, resize: "vertical", lineHeight: 1.65 }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleCompose}
                  disabled={saving}
                  style={{
                    flex: 2, padding: "13px", borderRadius: 14,
                    background: saving ? `${roleAccent}80` : roleAccent,
                    color: "#fff", border: "none", fontWeight: 900, fontSize: 12,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    cursor: saving ? "not-allowed" : "pointer", transition: "all 0.2s",
                  }}
                >
                  {saving ? "Publishing…" : "📢 Publish Announcement"}
                </button>
                <button
                  onClick={() => setComposing(false)}
                  style={{
                    flex: 1, padding: "13px", borderRadius: 14,
                    background: "transparent", color: sec,
                    border: `1px solid ${bdr}`, fontWeight: 700,
                    fontSize: 12, textTransform: "uppercase", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AnnouncementBell;

import { useEffect, useState, useCallback } from "react";
import { api } from "./api/client.js";
import StatGrid from "./components/StatGrid.jsx";
import GeneratePanel from "./components/GeneratePanel.jsx";
import UnscheduledReasons from "./components/UnscheduledReasons.jsx";
import CompanyTable from "./components/CompanyTable.jsx";
import InterviewsPanel from "./components/InterviewsPanel.jsx";
import DisruptionPanel from "./components/DisruptionPanel.jsx";
import DiffPanel from "./components/DiffPanel.jsx";
import DisruptionLogPanel from "./components/DisruptionLogPanel.jsx";

export default function App() {
  const [dashboard, setDashboard] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const showToast = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const loadAll = useCallback(async () => {
    try {
      const [dash, companyList, roomList] = await Promise.all([
        api.dashboard(),
        api.companies(),
        api.rooms(),
      ]);
      setDashboard(dash);
      setCompanies(companyList);
      setRooms(roomList);
    } catch (err) {
      showToast(err.message, "error");
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleGenerate(form) {
    setBusy(true);
    try {
      const res = await api.generateDataset(form);
      showToast(
        `Generated ${res.counts.companies} companies / ${res.counts.students} students / ${res.counts.rooms} rooms — ${Math.round(
          res.metrics.completionRate * 100
        )}% scheduled.`
      );
      setLastResult(null);
      await loadAll();
      setRefreshToken((t) => t + 1);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleRebuild() {
    setBusy(true);
    try {
      const res = await api.rebuildSchedule();
      showToast(`Rebuilt schedule — ${Math.round(res.metrics.completionRate * 100)}% scheduled.`);
      setLastResult(null);
      await loadAll();
      setRefreshToken((t) => t + 1);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisruptionResult(result) {
    setLastResult(result);
    showToast(
      `Replan done: ${result.diff.moved.length} moved, ${result.diff.cancelled.length} cancelled, ${Math.round(
        (result.diff.churn?.churnRate || 0) * 100
      )}% churn.`
    );
    await loadAll();
    setRefreshToken((t) => t + 1);
  }

  const hasData = dashboard && dashboard.counts?.companies > 0;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <h1>Placement Week Scheduler</h1>
          <span>Mirai Labs · Coordinator console</span>
        </div>
        <div className="topbar-actions">
          {dashboard && (
            <span className="small-muted">
              {dashboard.counts.companies} companies · {dashboard.counts.students} students ·{" "}
              {dashboard.counts.rooms} rooms
            </span>
          )}
        </div>
      </div>

      <div className="main">
        <div className="col">
          <GeneratePanel onGenerate={handleGenerate} onRebuild={handleRebuild} busy={busy} />

          {!hasData && (
            <div className="card">
              <div className="empty-state">
                No dataset yet — click "Generate + schedule" above to create a realistic placement week and
                build its first schedule.
              </div>
            </div>
          )}

          {hasData && (
            <>
              <div className="card">
                <h2>Overview</h2>
                <p className="subtitle">What "good" means here: high completion, zero clashes, balanced room/panel use, low student wait, low replan churn.</p>
                <StatGrid metrics={dashboard.metrics} />
              </div>

              <div className="card">
                <h2>Why interviews couldn't be scheduled</h2>
                <p className="subtitle">The system never fails silently — every gap has a specific, machine-readable reason.</p>
                <UnscheduledReasons byReason={dashboard.metrics.unscheduledByReason} />
              </div>

              <div className="card">
                <h2>Companies by day</h2>
                <p className="subtitle">Day 1 is deliberately loaded with mass recruiters, per real placement-week patterns.</p>
                <CompanyTable byCompany={dashboard.byCompany} />
              </div>

              <InterviewsPanel companies={companies} rooms={rooms} refreshToken={refreshToken} />
            </>
          )}
        </div>

        <div className="col">
          {hasData && (
            <DisruptionPanel
              companies={companies}
              rooms={rooms}
              onResult={handleDisruptionResult}
              busy={busy}
              setBusy={setBusy}
            />
          )}
          <DiffPanel result={lastResult} />
          <DisruptionLogPanel log={dashboard?.recentDisruptions} />
        </div>
      </div>

      {toast && <div className={`toast ${toast.type === "error" ? "error" : ""}`}>{toast.message}</div>}
    </div>
  );
}

import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, clearToken, setToken, token } from "./api.js";
import "./app.css";

const STATUS_LABEL = { soaking: "浸茧", reeling: "缫丝中", reeled: "已缫完" };

function Login({ onOk }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("123456");
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setToken(data.access_token);
      onOk(data.user);
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <div class="login">
      <h1>江口缫丝坞</h1>
      <p>汤温环盆作业台，不是列表台账。</p>
      <form onSubmit={submit} autocomplete="off">
        <label>
          用户名
          <input name="username" autocomplete="off" value={username} onInput={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          密码
          <input name="password" type="password" autocomplete="off" value={password} onInput={(e) => setPassword(e.target.value)} />
        </label>
        <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
        <button type="submit">登录</button>
      </form>
      {err && <p class="err">{err}</p>}
    </div>
  );
}

function Topbar({ user, view, onNav }) {
  return (
    <div class="topbar">
      <div>
        <h1>江口缫丝坞</h1>
        <nav class="nav">
          <button class={view === "yard" ? "on" : ""} onClick={() => onNav("yard")}>
            环盆作业台
          </button>
          <button class={view === "drains" ? "on" : ""} onClick={() => onNav("drains")}>
            放汤勾
          </button>
        </nav>
      </div>
      <div class="who">
        <span>
          {user.username} · {user.role === "admin" ? "管理员" : "缫丝工"}
        </span>
        <button
          onClick={() => {
            clearToken();
            location.reload();
          }}
        >
          退出
        </button>
      </div>
    </div>
  );
}

function Yard() {
  const [board, setBoard] = useState(null);
  const [picked, setPicked] = useState(null);
  const [temp, setTemp] = useState("40");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(keepId) {
    const data = await api("/api/board");
    setBoard(data);
    const id = keepId ?? picked?.id;
    if (id) {
      setPicked(data.basins.find((b) => b.id === id) || null);
    }
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e.message));
  }, []);

  if (!board) {
    return (
      <div class="yard">
        {err || "装载环盆…"}
      </div>
    );
  }

  const n = board.basins.length;
  async function writeTemp() {
    setErr("");
    setBusy(true);
    try {
      await api(`/api/basins/${picked.id}/readings`, {
        method: "POST",
        body: JSON.stringify({ waterTempC: Number(temp) }),
      });
      await refresh();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(status) {
    setErr("");
    setBusy(true);
    try {
      await api(`/api/basins/${picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (ex) {
      // 页上可能已被别人改勾/改态，重新拉一遍再把拒绝原因亮给用户
      await refresh().catch(() => {});
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  async function returnToSoaking() {
    setErr("");
    setBusy(true);
    try {
      await api(`/api/basins/${picked.id}/return-soaking`, { method: "POST" });
      await refresh();
    } catch (ex) {
      // 400 未勾放汤勾 / 409 被人抢先——都以服务端最新状态为准刷新
      await refresh().catch(() => {});
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="yard">
      <p class="ruleline">点盆登记汤温；已缫完须最近汤温 38～42℃；拨回浸茧须先在「放汤勾」勾选汤已放完</p>
      <div class="ring">
        {board.basins.map((b, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const left = 50 + Math.cos(angle) * 38;
          const top = 50 + Math.sin(angle) * 38;
          return (
            <button
              key={b.id}
              class={`basin ${b.status}${picked?.id === b.id ? " picked" : ""}${b.bathDrained ? " drained" : ""}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={() => setPicked(b)}
            >
              <strong>{b.code}</strong>
              <span>{STATUS_LABEL[b.status]}</span>
              {b.bathDrained && <span class="tick">汤已放</span>}
            </button>
          );
        })}
      </div>
      {picked && (
        <div class="drawer">
          <h3>
            {picked.code} · {STATUS_LABEL[picked.status]}
          </h3>
          <p>
            最近汤温：{picked.latestTempC ?? "无"} ℃ · 记录 {picked.readingCount} 次 ·{" "}
            <span class={picked.bathDrained ? "drained-yes" : "drained-no"}>
              放汤勾{picked.bathDrained ? "已勾（汤已放完）" : "未勾"}
            </span>
          </p>
          <input value={temp} onInput={(e) => setTemp(e.target.value)} />
          <button onClick={writeTemp} disabled={busy}>
            登记汤温
          </button>
          <div>
            <button onClick={() => setStatus("reeling")} disabled={busy}>
              缫丝中
            </button>
            <button onClick={() => setStatus("reeled")} disabled={busy}>
              已缫完
            </button>
            <button class="primary" onClick={returnToSoaking} disabled={busy}>
              拨回浸茧
            </button>
          </div>
          {err && <p class="err">{err}</p>}
        </div>
      )}
    </div>
  );
}

function DrainPage({ user }) {
  const [board, setBoard] = useState(null);
  const [err, setErr] = useState("");
  const [savingId, setSavingId] = useState(null);
  const admin = user.role === "admin";

  async function refresh() {
    const data = await api("/api/board");
    setBoard(data);
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e.message));
  }, []);

  async function toggle(basin, drained) {
    setErr("");
    setSavingId(basin.id);
    try {
      await api(`/api/basins/${basin.id}/drained`, {
        method: "PUT",
        body: JSON.stringify({ drained }),
      });
      await refresh();
    } catch (ex) {
      await refresh().catch(() => {});
      setErr(ex.message);
    } finally {
      setSavingId(null);
    }
  }

  if (!board) {
    return <div class="drains">{err || "装载放汤勾…"}</div>;
  }

  return (
    <div class="drains">
      <p class="ruleline">
        已缫完的盆，管理员在此勾选「汤已放完」后，抽屉才允许拨回浸茧。
        {admin ? "勾/取消即时保存。" : "你是缫丝工，此页只能查看，勾选请找管理员。"}
      </p>
      <ul class="drain-list">
        {board.basins.map((b) => (
          <li key={b.id} class={`drain-row ${b.status}`}>
            <label>
              <input
                type="checkbox"
                checked={b.bathDrained}
                disabled={!admin || savingId === b.id}
                onChange={(e) => toggle(b, e.target.checked)}
              />
              <span class="drain-tick">汤已放完</span>
            </label>
            <strong>{b.code}</strong>
            <span class="drain-status">{STATUS_LABEL[b.status]}</span>
            <span class="drain-temp">最近汤温 {b.latestTempC ?? "无"} ℃</span>
          </li>
        ))}
      </ul>
      {err && <p class="err">{err}</p>}
    </div>
  );
}

function Shell({ user }) {
  const [view, setView] = useState("yard");
  return (
    <div class="shell">
      <Topbar user={user} view={view} onNav={setView} />
      {view === "yard" ? <Yard /> : <DrainPage user={user} />}
    </div>
  );
}

function App() {
  const [auth, setAuth] = useState(null);
  const [bootErr, setBootErr] = useState("");

  useEffect(() => {
    if (!token()) return;
    api("/api/auth/me")
      .then((me) => setAuth(me))
      .catch((e) => {
        clearToken();
        setBootErr(e.message);
      });
  }, []);

  if (!token()) return <Login onOk={(u) => setAuth(u)} />;
  if (!auth) return <div class="yard">{bootErr || "认人中…"}</div>;
  return <Shell user={auth} />;
}

render(<App />, document.getElementById("app"));

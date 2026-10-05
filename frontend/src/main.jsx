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
      onOk();
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

function Yard() {
  const [board, setBoard] = useState(null);
  const [picked, setPicked] = useState(null);
  const [temp, setTemp] = useState("40");
  const [err, setErr] = useState("");

  async function refresh() {
    const data = await api("/api/board");
    setBoard(data);
    if (picked) {
      setPicked(data.basins.find((b) => b.id === picked.id) || data.basins[0]);
    }
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e.message));
  }, []);

  if (!board) {
    return (
      <div>
        {err || "装载环盆…"}
      </div>
    );
  }

  const n = board.basins.length;
  async function writeTemp() {
    setErr("");
    try {
      const row = await api(`/api/basins/${picked.id}/readings`, {
        method: "POST",
        body: JSON.stringify({ waterTempC: Number(temp) }),
      });
      await refresh();
      setPicked(row);
    } catch (ex) {
      setErr(ex.message);
    }
  }
  async function setStatus(status) {
    setErr("");
    try {
      const row = await api(`/api/basins/${picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await refresh();
      setPicked(row);
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <div>
      <p class="hint">{board.riverside} · 点盆登记汤温；已缫完须最近汤温 38～42℃；拨回浸茧须汤已放完</p>
      <div class="ring">
        {board.basins.map((b, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const left = 50 + Math.cos(angle) * 38;
          const top = 50 + Math.sin(angle) * 38;
          return (
            <button
              key={b.id}
              class={`basin ${b.status}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={() => setPicked(b)}
            >
              <strong>{b.code}</strong>
              <span>{STATUS_LABEL[b.status]}</span>
            </button>
          );
        })}
      </div>
      {picked && (
        <div class="drawer">
          <h3>
            {picked.code} · {STATUS_LABEL[picked.status]}
          </h3>
          <p>最近汤温：{picked.latestTempC ?? "无"} ℃ · 记录 {picked.readingCount} 次</p>
          {picked.status === "reeled" && (
            <p class="hint">
              {picked.soupDrained
                ? "汤已放完，可拨回浸茧。"
                : "汤未放完：须由管理员在「放汤勾」页勾选后，才能拨回浸茧。"}
            </p>
          )}
          <input value={temp} onInput={(e) => setTemp(e.target.value)} />
          <button onClick={writeTemp}>登记汤温</button>
          <div>
            <button onClick={() => setStatus("soaking")}>浸茧</button>
            <button onClick={() => setStatus("reeling")}>缫丝中</button>
            <button onClick={() => setStatus("reeled")}>已缫完</button>
          </div>
          {err && <p class="err">{err}</p>}
        </div>
      )}
    </div>
  );
}

function DrainPage({ me }) {
  const [board, setBoard] = useState(null);
  const [err, setErr] = useState("");
  const isAdmin = me?.role === "admin";

  async function refresh() {
    const data = await api("/api/board");
    setBoard(data);
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e.message));
  }, []);

  async function toggle(basin, drained) {
    setErr("");
    try {
      await api(`/api/basins/${basin.id}/drain`, {
        method: "POST",
        body: JSON.stringify({ soupDrained: drained }),
      });
      await refresh();
    } catch (ex) {
      setErr(ex.message);
      refresh().catch(() => {});
    }
  }

  if (!board) {
    return <div>{err || "装载放汤勾…"}</div>;
  }

  return (
    <div class="drain">
      <p class="hint">
        已缫完的盆拨回浸茧前，须在此勾选「汤已放完」；勾选只记放汤，不会拨动盆态。
        {isAdmin ? "你是管理员，可勾。" : "缫丝工只能查看，要勾找管理员。"}
      </p>
      {board.basins.map((b) => (
        <label key={b.id} class={`drain-row ${b.status}`}>
          <input
            type="checkbox"
            checked={b.soupDrained}
            disabled={!isAdmin}
            onChange={(e) => toggle(b, e.target.checked)}
          />
          <strong>{b.code}</strong>
          <span>{STATUS_LABEL[b.status]}</span>
          <span class="drain-state">{b.soupDrained ? "汤已放完" : "汤未放完"}</span>
        </label>
      ))}
      {err && <p class="err">{err}</p>}
    </div>
  );
}

function App() {
  const [ready, setReady] = useState(Boolean(token()));
  const [me, setMe] = useState(null);
  const [view, setView] = useState("ring");

  useEffect(() => {
    if (!ready) return;
    api("/api/auth/me")
      .then(setMe)
      .catch(() => {
        clearToken();
        setReady(false);
      });
  }, [ready]);

  if (!ready) {
    return <Login onOk={() => setReady(true)} />;
  }

  return (
    <div class="yard">
      <div class="topbar">
        <h1>江口缫丝坞</h1>
        <nav>
          <button class={view === "ring" ? "on" : ""} onClick={() => setView("ring")}>
            环盆作业台
          </button>
          <button class={view === "drain" ? "on" : ""} onClick={() => setView("drain")}>
            放汤勾
          </button>
          <button
            onClick={() => {
              clearToken();
              location.reload();
            }}
          >
            退出
          </button>
        </nav>
      </div>
      {view === "ring" ? <Yard /> : <DrainPage me={me} />}
    </div>
  );
}

render(<App />, document.getElementById("app"));

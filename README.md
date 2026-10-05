# SilkReel-01 · 江口缫丝坞

缫丝盆环状作业台。登录后看到的是沿汤池围成一圈的盆位，点盆登记汤温并改状态——不是侧栏双列表 CRUD。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web API | Quart（异步 Flask 族）· Hypercorn |
| 结构 | `repositories.py` 仓储 + `services.py` 门槛，路由不直接拼 SQL |
| 数据 | SQLAlchemy 2 async · asyncpg · PostgreSQL 15 |
| 前端 | Preact 10 · Vite |
| 部署 | Docker Compose |

## 路径与端口

- 前端：http://localhost:4760
- API：http://localhost:8760
- PostgreSQL：localhost:6160

## 演示账号

| 用户名 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `123456` | 管理员 |
| `worker` | `123456` | 缫丝工 |

## 业务规则

- 盆状态不可标成「已缫完」，除非该盆**最近一条**汤温记录落在 **38～42℃**。规则在 `backend/app/services.py`。
- **放汤勾流程**：已缫完的盆要拨回浸茧，须先在顶栏「放汤勾」专页由**管理员**勾选该盆「汤已放完」；缫丝工进专页只能看。
  - 拨回浸茧只能从盆位**抽屉**发起（`POST /api/basins/:id/return-soaking`）：未勾选一律 400 拒绝；旧的直接改状态接口不允许拨到浸茧，勾没勾都拒。
  - 拨回在数据库行锁事务内校验，两人抢拨同一盆只有一个成功，另一个收到 409；成功后盆回浸茧、放汤勾自动清掉。
  - 勾选与登记汤温、标已缫完互不影响：标已缫完只看汤温，不看勾选。

## 快速启动

```bash
cd SilkReel/SilkReel-01
docker compose up --build
```

"""缫丝盆门槛。

- 标成已缫完：须最近一次汤温落在 38～42℃（与放汤勾无关）。
- 拨回浸茧：须管理员已在专页勾选该盆「汤已放完」；且盆当前确在已缫完。
"""

from app.models import Basin, User

MIN_TEMP = 38.0
MAX_TEMP = 42.0
ROLE_ADMIN = "admin"


class RuleError(ValueError):
    """业务门槛不通过（400）。"""


class ConflictError(ValueError):
    """状态已被别人抢先改掉（409）。"""


def is_admin(user: User) -> bool:
    return user.role == ROLE_ADMIN


def latest_temp(basin: Basin) -> float | None:
    if not basin.readings:
        return None
    latest = max(basin.readings, key=lambda r: r.taken_at)
    return latest.water_temp_c


def assert_can_set_status(basin: Basin, new_status: str) -> None:
    allowed = {Basin.STATUS_SOAKING, Basin.STATUS_REELING, Basin.STATUS_REELED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")
    # 拨回浸茧是放汤流程，只能走专页勾选 + 抽屉拨回接口，不许直接改状态旁路
    if new_status == Basin.STATUS_SOAKING:
        raise RuleError("拨回浸茧须确认汤已放完，请在盆位抽屉中操作")
    if new_status != Basin.STATUS_REELED:
        return
    temp = latest_temp(basin)
    if temp is None:
        raise RuleError("该盆尚无汤温记录，不能标已缫完")
    if temp < MIN_TEMP or temp > MAX_TEMP:
        raise RuleError(
            f"最近汤温 {temp}℃ 不在 {MIN_TEMP:.0f}～{MAX_TEMP:.0f}℃，不能标已缫完"
        )


def assert_can_return_to_soaking(basin: Basin) -> None:
    """抽屉拨回浸茧：先看盆态，再看放汤勾。盆态判断须落在行锁事务内。

    抢拨成功者会清掉放汤勾，故「已是浸茧」必须先判——
    否则第二个抢拨者拿到的是 soaking + 未勾，会被误报成“汤没放完”(400)，
    而真正语义是“手慢一步”(409)。
    """
    if basin.status == Basin.STATUS_SOAKING:
        raise ConflictError("手慢一步：这盆已被拨回浸茧了")
    if not basin.bath_drained:
        raise RuleError("汤还没放完：请管理员先在放汤勾专页勾选该盆")
    if basin.status != Basin.STATUS_REELED:
        raise RuleError("只有已缫完的盆才能拨回浸茧")

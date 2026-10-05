from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Basin, BathReading, Filature, User


class UserRepo:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def by_username(self, username: str) -> User | None:
        result = await self.session.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()


class BasinRepo:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def board(self) -> Filature | None:
        result = await self.session.execute(
            select(Filature).options(
                selectinload(Filature.basins).selectinload(Basin.readings)
            )
        )
        return result.scalars().first()

    async def get(self, basin_id: int) -> Basin | None:
        result = await self.session.execute(
            select(Basin)
            .options(selectinload(Basin.readings))
            .where(Basin.id == basin_id)
        )
        return result.scalar_one_or_none()

    async def get_for_update(self, basin_id: int) -> Basin | None:
        """事务内 SELECT ... FOR UPDATE：并发抢拨同一盆时在此串行化。

        不加 readings 预载——拨回门槛只看放汤勾与盆态；返回 JSON 前再走普通 get。
        """
        result = await self.session.execute(
            select(Basin).where(Basin.id == basin_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def add_reading(self, basin: Basin, temp_c: float, operator: str) -> BathReading:
        row = BathReading(basin=basin, water_temp_c=temp_c, operator=operator)
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def save_status(self, basin: Basin, status: str) -> None:
        basin.status = status
        await self.session.commit()

    def mark_drained(self, basin: Basin, drained: bool) -> None:
        """只改字段；调用方在持锁事务内负责提交。"""
        basin.bath_drained = drained

    def mark_returned_to_soaking(self, basin: Basin) -> None:
        """拨回浸茧：回到新一轮浸茧，放汤勾一并清掉。调用方负责提交。"""
        basin.status = Basin.STATUS_SOAKING
        basin.bath_drained = False

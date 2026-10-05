from sqlalchemy import select, update
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

    async def add_reading(self, basin: Basin, temp_c: float, operator: str) -> BathReading:
        row = BathReading(basin=basin, water_temp_c=temp_c, operator=operator)
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def save_status(self, basin: Basin, status: str) -> None:
        basin.status = status
        await self.session.commit()

    async def set_soup_drained(self, basin: Basin, drained: bool) -> None:
        basin.soup_drained = drained
        await self.session.commit()

    async def return_to_soaking(self, basin: Basin) -> bool:
        """已缫完→浸茧的原子拨回。

        只有仍是已缫完且汤已放完才拨得动；拨成即消耗放汤勾。
        两人抢拨时数据库行锁只放一行过去，败者 rowcount 为 0。
        """
        result = await self.session.execute(
            update(Basin)
            .where(
                Basin.id == basin.id,
                Basin.status == Basin.STATUS_REELED,
                Basin.soup_drained.is_(True),
            )
            .values(status=Basin.STATUS_SOAKING, soup_drained=False)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            await self.session.rollback()
            return False
        await self.session.commit()
        await self.session.refresh(basin)
        return True

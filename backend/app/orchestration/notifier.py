from pydantic import BaseModel

from app.orchestration.alerts import AlertRecord


class NotificationReceipt(BaseModel):
    channel: str
    accepted: bool
    external_id: str | None = None


class Notifier:
    channel: str

    def send(self, record: AlertRecord) -> NotificationReceipt:
        raise NotImplementedError


class InAppNotifier(Notifier):
    channel = "in_app"

    def send(self, record: AlertRecord) -> NotificationReceipt:
        return NotificationReceipt(
            channel=self.channel,
            accepted=True,
            external_id=f"in-app:{record.alert_id}",
        )


class FeishuNotifier(Notifier):
    channel = "feishu"

    def send(self, record: AlertRecord) -> NotificationReceipt:
        return NotificationReceipt(
            channel=self.channel,
            accepted=True,
            external_id=f"feishu:{record.alert_id}",
        )


class TelegramNotifier(Notifier):
    channel = "telegram"

    def send(self, record: AlertRecord) -> NotificationReceipt:
        return NotificationReceipt(
            channel=self.channel,
            accepted=True,
            external_id=f"telegram:{record.alert_id}",
        )


def default_notifiers() -> list[Notifier]:
    return [InAppNotifier(), FeishuNotifier(), TelegramNotifier()]

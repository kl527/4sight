"""Unit tests for the /poke router."""

from unittest.mock import AsyncMock, patch


async def test_send_message_success(client):
    mock_response = {"id": "msg_123", "status": "delivered"}
    with patch("app.routers.poke.poke_client.send", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = mock_response
        resp = await client.post(
            "/poke/send",
            json={"message": "that burrito just cost you 45 minutes"},
            headers={"x-poke-api-key": "test-key-123"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == mock_response
    mock_send.assert_awaited_once_with("that burrito just cost you 45 minutes", "test-key-123")


async def test_send_message_missing_api_key(client):
    resp = await client.post("/poke/send", json={"message": "hello"})
    assert resp.status_code == 500
    assert "Poke API key not configured" in resp.json()["detail"]


async def test_send_message_upstream_error(client):
    with patch("app.routers.poke.poke_client.send", new_callable=AsyncMock) as mock_send:
        mock_send.side_effect = Exception("connection refused")
        resp = await client.post(
            "/poke/send",
            json={"message": "test"},
            headers={"x-poke-api-key": "key"},
        )
    assert resp.status_code == 502
    assert "connection refused" in resp.json()["detail"]


async def test_send_message_invalid_body(client):
    resp = await client.post(
        "/poke/send",
        json={},
        headers={"x-poke-api-key": "key"},
    )
    assert resp.status_code == 422

let ws = null;
let sessionId = null;
let handleId = null;
let currentRoom = null;
let pc = null;

const JANUS_URL = "wss://ec2-54-180-104-21.ap-northeast-2.compute.amazonaws.com:8188"

async function loadRooms() {
  ws = new WebSocket(JANUS_URL);

  ws.onopen = () => {
    createSession();
  };

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    handleJanusMessage(data);
  };
}

function wsSend(obj) {
  ws.send(JSON.stringify(obj));
}

function createSession() {
  wsSend({ janus: "create", transaction: "create-session" });
}

function handleJanusMessage(data) {
  if (data.janus === "success" && !sessionId) {
    sessionId = data.data.id;
    attachPlugin();
    return;
  }

  if (data.janus === "success" && data?.plugindata?.data?.audiobridge === "success") {
    listRooms();
    return;
  }

  if (data.janus === "event" && data.plugindata?.data?.list) {
    renderRooms(data.plugindata.data.list);
    return;
  }

  if (data.janus === "event" && data.plugindata?.data?.joined) {
    startWebRTC();
    return;
  }

  if (data.janus === "event" && data.jsep) {
    pc.setRemoteDescription(new RTCSessionDescription(data.jsep));
  }
}

function attachPlugin() {
  wsSend({
    janus: "attach",
    session_id: sessionId,
    plugin: "janus.plugin.audiobridge",
    transaction: "attach"
  });
}

function listRooms() {
  wsSend({
    janus: "message",
    session_id: sessionId,
    handle_id: handleId,
    body: { request: "list" },
    transaction: "list"
  });
}

function renderRooms(rooms) {
  const container = document.getElementById("rooms");
  container.innerHTML = "<h2>방 목록</h2>";

  rooms.forEach(room => {
    const btn = document.createElement("button");
    btn.innerText = `입장: ${room.description} (ID=${room.room})`;
    btn.onclick = () => joinRoom(room.room);
    container.appendChild(btn);
    container.appendChild(document.createElement("br"));
  });
}

function joinRoom(roomId) {
  currentRoom = roomId;
  document.getElementById("currentRoom").innerText = `방 ID: ${roomId}`;

  wsSend({
    janus: "message",
    session_id: sessionId,
    handle_id: handleId,
    body: {
      request: "join",
      room: roomId,
      display: "WebClient"
    },
    transaction: "join"
  });
}

async function startWebRTC() {
  pc = new RTCPeerConnection();

  pc.ontrack = (event) => {
    const audio = document.createElement("audio");
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
  };

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  wsSend({
    janus: "message",
    session_id: sessionId,
    handle_id: handleId,
    body: { request: "configure", muted: false },
    jsep: offer,
    transaction: "configure"
  });
}

function leaveRoom() {
  if (!currentRoom) return;

  wsSend({
    janus: "message",
    session_id: sessionId,
    handle_id: handleId,
    body: { request: "leave" },
    transaction: "leave"
  });

  if (pc) pc.close();
  pc = null;
  currentRoom = null;
  document.getElementById("currentRoom").innerText = "참여 중 아님";
}

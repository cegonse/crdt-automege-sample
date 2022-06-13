const buildChangesMessage = (id, changes) => JSON.stringify({ userId: id, changes: toBase64(changes) });
const buildLoginMessage = (id) => JSON.stringify({ userId: id });
const buildMoveMessage = (id, profile, x, y) => JSON.stringify({ userId: id, cursor: { profile, x, y }});
const findById = (id) => document.querySelector(`#${id}`);

let userId = `User${Math.floor(Math.random() * 100)}`;
const cursorProfile = Math.floor(Math.random() * 5);
let connected = false;
let scenarioReceived = false;
let lastMoveMessage = performance.now();

findById("username").value = userId;

// We can use Automerge's Document class to keep track of the CRDT
//
// In a true local-first scenario, the client could send its version
// of the document to the backend when deciding to share it, and the
// backend would forward it to other clients wanting to work on it
// afterwards. This is important because all clients working on a document
// must start from the same document, otherwise Automerge will not know
// how to merge incoming changes
//
// To simplify things, in this example the backend will hold the "master"
// copy of the document, and all clients will merge from it
//
// Naming it scenario to avoid colliding with DOM's document object BTW
let scenario = Automerge.init();

findById("connect").addEventListener("click", () => {
  userId = findById("username").value.replace(" ", "");
  const socket = new WebSocket('ws://localhost:4545');

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    // Receiving the bare document from the backend. This happens when
    // the client connects to the server. This is due to assuming the client
    // has no local state previously
    //
    // In a full local first scenario, the client would store its own modifications
    // through Automerge.save() or Automerge.getLocalChanges(), and sending the whole
    // document or the deltas to the backend on connection to forward its changes
    // to the other clients
    if (message.document) {
      // Automerge serializes deltas and documents as binary arrays (Uint8Array), so
      // to simply things we'll use base64 and encapsulate them in JSON objects
      const binary = fromBase64(message.document);

      // Our starting document will be base + backend contents
      scenario = Automerge.merge(scenario, Automerge.load(binary));
      scenarioReceived = true;
      render();
    }

    if (message.changes) {
      const changes = fromBase64(message.changes);
      // Changes were received from the backend: apply them to our local copy
      // This works because both endpoints started from the same point (init+backend doc)
      // In the diff object Automerge generates a binary-serialized difference between
      // what we had and the previous state
      const [newScenario, diff] = Automerge.applyChanges(scenario, [changes]);
      scenario = newScenario;
      render();
    }

    if (message.cursor) {
      if (message.userId === userId) return;
      addCursor(message);
      renderCursors();
    }

    if (message.cursor === undefined) {
      console.log("Received", message);
    }
  });

  const updateNode = (id) => {
    const nodeId = id.split("_")[0];
    
    // When updating the document, the class method change must be used
    // This receives a new document through the delta, and returns a new
    // document, as documents are immutable
    const newScenario = Automerge.change(scenario, (doc) => {
      const node = doc.nodes.find((n) => n.id === nodeId);
  
      if (isChecked(id)) {
        node.status = "open";
      } else {
        node.status = "closed";
      }
    });
  
    // Get the diff between the new document we've built and the existing one,
    // and send it through the tube
    const changes = Automerge.getChanges(scenario, newScenario);
    socket.send(buildChangesMessage(userId, changes[0]));
    console.log("New scenario: ", newScenario);
    
    scenario = newScenario;
  }

  socket.addEventListener('open', () => {
    socket.send(buildLoginMessage(userId));
    connected = true;
  });

  document.querySelector("body").addEventListener("mousemove", (e) => {
    const shouldUpdateCursor = () => performance.now() - lastMoveMessage > 80;
    if (connected) {
      if (shouldUpdateCursor()) {
        socket.send(buildMoveMessage(userId, cursorProfile, e.clientX, e.clientY));
        lastMoveMessage = performance.now();
      }
    }
  });

  window.updateNode = updateNode;
});

/////////////////////////////////////////////
// Rendering code (here be dragons...)
/////////////////////////////////////////////

const cursors = [
  require("./images/cursor1.png"),
  require("./images/cursor2.png"),
  require("./images/cursor3.png"),
  require("./images/cursor4.png"),
  require("./images/cursor5.png")
];

const cursorColors = [
  "8a70fc",
  "4bb62c",
  "d9d559",
  "b22212",
  "d82ee5"
];

const cursorTextColors = [
  "FFFFFF",
  "FFFFFF",
  "000000",
  "FFFFFF",
  "FFFFFF",
];

const cursorTargetPosition = [];

const scenarioGraph = [
  {
    x: 100,
    y: 100,
    id: "Junction1",
    next: "Junction3"
  },
  {
    x: 400,
    y: 100,
    id: "Junction2",
    next: "Junction1"
  },
  {
    x: 100,
    y: 400,
    id: "Junction3",
    next: "Junction4"
  },
  {
    x: 400,
    y: 400,
    id: "Junction4",
    next: "Junction2"
  }
];

let deltaTime = 0;
const clock = new THREE.Clock();

const addCursor = (message) => {
  const cursorId = `${message.userId}_cursor`;
  const nameId = `${message.userId}_name`;

  if (!findById(cursorId)) {
    const t = cursorTemplate(message.userId, message.cursor.profile);
    document.querySelector("body").innerHTML += t;
  }

  findById(nameId).style["background-color"] = cursorColors[message.cursor.profile];
  findById(nameId).style["color"] = cursorTextColors[message.cursor.profile];

  const cursorTarget = cursorTargetPosition.find((c) => c.id === message.userId);

  if (cursorTarget === undefined) {
    cursorTargetPosition.push({ id: message.userId, x: message.cursor.x, y: message.cursor.y });
  } else {
    cursorTarget.x = message.cursor.x;
    cursorTarget.y = message.cursor.y;

  }
}

const renderCursors = (dt) => {
  const cursors = document.querySelectorAll("[id$=_cursor]");

  cursors.forEach((cursor) => {
    const targetPosition = cursorTargetPosition.find((c) => c.id === cursor.id.split("_")[0]);
    const cursorRect = cursor.getBoundingClientRect();
    cursor.style.left = THREE.MathUtils.damp(cursorRect.left, targetPosition.x, 10, dt);
    cursor.style.top = THREE.MathUtils.damp(cursorRect.top, targetPosition.y, 10, dt);
  });
}

animationFrame();
function animationFrame() {
  requestAnimationFrame(animationFrame);
  deltaTime = clock.getDelta();
  renderCursors(deltaTime);
}

const findInGraphById = (id) => scenarioGraph.find((g) => g.id === id);

const cursorTemplate = (id, profile) => `<div class="cursorTooltip" id="${id}_cursor">
  <img src="${cursors[profile]}" class="cursor"></img>
  <span id="${id}_name" class="cursorUserId">${id}</span>
</div>`;

const isChecked = (id) => document.querySelector(`#${id}`).checked;

const nodeTemplate = (id, status) => `<div class="node" id="${id}">
  <span class="nodeItem"><b>ID</b> <span id="${id}_idLabel">${id}</span></span>
  <span class="nodeItem"><b>Status</b> <span id="${id}_statusLabel">${status}</span></span>
  <input class="nodeItem" id="${id}_check" ${status === "open" ? "checked" : ""} type="checkbox" onclick="window.updateNode(this.id)"></input>
</div>`;

const render = () => {
  if (!scenarioReceived) return;

  const canvas = findById("canvas");
  const ctx = findById("canvas").getContext("2d");

  canvas.width = document.body.clientWidth;
  canvas.height = document.body.clientHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  scenario.nodes.forEach((node) => {
    if (!findById(`${node.id}`)) {
      const t = nodeTemplate(node.id, node.status);
      findById("nodes").innerHTML += t;
    }

    const graphNode = findInGraphById(node.id);
    const nextNode = findInGraphById(graphNode.next);

    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.setLineDash(node.status === "closed" ? [5, 15] : []);
    ctx.moveTo(graphNode.x, graphNode.y);
    ctx.lineTo(nextNode.x, nextNode.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.moveTo(graphNode.x, graphNode.y);
    ctx.lineTo(graphNode.x + 50, graphNode.y + 50);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(graphNode.x, graphNode.y, 10, 0, 2 * Math.PI);
    ctx.fill();
    
    findById(node.id).style.left = graphNode.x + 50;
    findById(node.id).style.top = graphNode.y + 50;
    findById(`${node.id}_idLabel`).innerHTML = node.id;
    findById(`${node.id}_statusLabel`).innerHTML = node.status;
    findById(`${node.id}_check`).checked = node.status === "open";
  })
}

const toBase64 = (buffer) => {
  var CHUNK_SZ = 0x8000;
  var c = [];
  for (var i=0; i < buffer.length; i+=CHUNK_SZ) {
    c.push(String.fromCharCode.apply(null, buffer.subarray(i, i+CHUNK_SZ)));
  }
  return btoa(c.join(""));
}

const fromBase64 = (base64) => {
  var binary_string = window.atob(base64);
  var len = binary_string.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

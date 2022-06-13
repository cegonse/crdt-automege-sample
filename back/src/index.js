const { WebSocketServer } = require('ws');
const Automerge = require('automerge');

const port = 4545;
const wss = new WebSocketServer({ port });

let document = Automerge.change(Automerge.init(), (doc) => {
  doc.nodes = [];
  doc.nodes.push({
    id: "Junction1",
    status: "open",
  });
  doc.nodes.push({
    id: "Junction2",
    status: "open",
  });
  doc.nodes.push({
    id: "Junction3",
    status: "open",
  });
  doc.nodes.push({
    id: "Junction4",
    status: "open",
  });
});

console.log(`Creating WS server at port ${port}`);

const buildDocumentMessage = (doc) => JSON.stringify({ document: toBase64(Automerge.save(doc)) });

wss.on('connection', (ws) => {
  sendMessage(ws, buildDocumentMessage(document));


  ws.on('message', (data) => {
    console.log(`Received ${data}`);
    const message = JSON.parse(data);

    if (message.userId) {
      ws.userId = message.userId;
    }

    broadcast(ws, data.toString());
  });
});

const broadcast = (fd, data) => {
  wss.clients.forEach((fd) => {
    sendMessage(fd, data.toString(), fd.userId);
  })
}

const sendMessage = (socket, data, id) => {
  console.log(`Sending [${id}] ${data}`)
  socket.send(data);
}

const toBase64 = (x) => Buffer.from(x).toString('base64');
const fromBase64 = (x) => Buffer.from(x, "base64");

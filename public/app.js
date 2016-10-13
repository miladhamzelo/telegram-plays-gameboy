var KEY = {
  RIGHT: 0,
  LEFT: 1,
  UP: 2,
  DOWN: 3,
  A: 4,
  B: 5,
  SELECT: 6,
  START: 7
};

function blobToImage(imageData) {
    if (Blob && typeof URL !== 'undefined') {
        var blob = new Blob([imageData], { type: 'image/png' });
        return URL.createObjectURL(blob);
    } else if (imageData.base64)
        return 'data:image/png;base64,' + imageData.data;
    else
        return 'about:blank';
}

function readImage(data) {
    var bytes = new Uint8Array(data);
    var image = document.getElementById('screen');
    image.src = blobToImage(data);
}

function readClients(clientsCount) {
    var clients = document.getElementById('client-count');
    clients.innerHTML = clientsCount;
}

var wsUri = window.document.location.href.replace(/^http[s]?:/, 'ws:');
var ws = new WebSocket(wsUri);
ws.onmessage = function (event) {
    var data = event.data;
    if (data instanceof Blob)
        return readImage(data);
    else if (!isNaN(data))
        return readClients(data);
    else
        console.log('Unknown message: ' + data);
}

var sendKey = function(key) {
    console.log("sending " + key)
    if (ws.readyState === WebSocket.OPEN)
        ws.send(key);
}
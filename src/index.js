const http = require('http');
const fs = require('fs');

const hostname = process.env.PROXY_HOST_NAME ? process.env.PROXY_HOST_NAME : '0.0.0.0';
const port = process.env.PROXY_PORT ? process.env.PROXY_PORT : 8080;

const server = http.createServer((req, res) => {
    let payload = '';
    req.on('data', (chunk) =>{
        payload += chunk;
    });

    req.on('end', (chunk) =>{
        if(payload.length > 0) {
            const data = JSON.parse(payload);
            console.debug(data);
            // const token = data.secret;
            // const [basepath, owner, repo, eventType] = req.url.replace(/^\/|\/$/g, '').split('/');
            // console.debug(basepath, owner, repo, eventType);
            res.statusCode = 200;
            res.end('Event Triggered.');
        } else {
            res.statusCode = 500;
            res.end('Prismic webhook payload not found in rquest.');
        }
    });
});

server.listen(port, hostname, () => {
    console.log(`Proxy running at http://${hostname}:${port}/`);
});

var signals = {
    'SIGHUP': 1,
    'SIGINT': 2,
    'SIGTERM': 15
};
const shutdown = (signal, value) => {
    console.log("shutdown!");
    server.close(() => {
        console.log(`server stopped by ${signal} with value ${value}`);
        process.exit(128 + value);
    });
};
Object.keys(signals).forEach((signal) => {
    process.on(signal, () => {
        console.log(`process received a ${signal} signal`);
        shutdown(signal, signals[signal]);
    });
});
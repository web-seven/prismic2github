const http = require('http');
const { Octokit } = require("@octokit/rest");

const hostname = process.env.PROXY_HOST_NAME ? process.env.PROXY_HOST_NAME : '0.0.0.0';
const port = process.env.PROXY_PORT ? process.env.PROXY_PORT : 8080;

const server = http.createServer((req, res) => {
    let payload = '';
    req.on('data', (chunk) => {
        payload += chunk;
    });

    req.on('end', () => {
        if (payload.length > 0) {
            const data = JSON.parse(payload);
            const [basepath, owner, repo, eventType] = req.url.replace(/^\/|\/$/g, '').split('/');
            if (!owner || !repo || !eventType) {
                res.end('Github repository owner, repo name or event type not found, please define it in URL eg.: /prismic/{owner}/{repo}/{event_type}');
                return;
            }
            if (!data.secret) {
                res.end('Secret key not found in prismic webhook payload, please define setup it as value of Github Access Token.');
                return;
            }
            const token = data.secret;
            const octokit = new Octokit({
                auth: token,
            });

            octokit.repos
                .createDispatchEvent({
                    owner: owner,
                    repo: repo,
                    event_type: eventType,
                    client_payload: data
                })
                .then(({ status }) => {
                    if (status === 204) {
                        res.statusCode = 200;
                        res.end(`Event "${eventType}" was successfully triggered on "${owner}/${repo}".`);
                    } else {
                        res.statusCode = status;
                        res.end('Event Not Triggered.');
                    }
                }).catch((e) => {
                    console.debug(e);
                    res.end('Event Not Triggered: ' + e.message);
                });

        } else {
            res.statusCode = 500;
            res.end('Prismic webhook payload not found in request.');
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
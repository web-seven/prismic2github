const http = require('http');
const url = require('url');
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
            const urlObject = url.parse(req.url,true);
            const queryParams = urlObject.query;
            const [basepath, owner, repo] = urlObject.pathname.replace(/^\/|\/$/g, '').split('/');
            if (!owner || !repo || !queryParams.branch || !queryParams.workflow || !queryParams.version) {
                res.statusCode = 400;
                res.end('Github repository owner, repo name or branch not found, please define it in URL eg.:'
                        +' /prismic/{owner}/{repo}?branch={branch_name}&workflow={workflow_id}&version={version}');
                return;
            }
            if (!data.secret) {
                res.statusCode = 400;
                res.end('Secret key not found in prismic webhook payload, please define setup it as value of Github Access Token.');
                return;
            }
            const token = data.secret;
            const octokit = new Octokit({
                auth: token
            });

            let releaseName = ''

            if (data.releases.addition) {
                releaseName = data.releases.addition[0].id;
            } else if (data.releases.update) {
                releaseName = data.releases.update[0].id;
            } else {
                res.statusCode = 400;
                res.end('Payload not contain data for create or update release');
                return;
            }

            octokit.actions.createWorkflowDispatch({
                owner: owner,
                repo: repo,
                ref: queryParams.branch,
                workflow_id: queryParams.workflow,
                inputs: {
                    release: releaseName,
                    version: queryParams.version,
                }
            }).then((releaseData) => {
                if (releaseData.status === 204) {
                    res.end(`Release "${releaseName}" was successfully sent to "${owner}/${repo}/${queryParams.branch}/${queryParams.workflow}".`);
                } else {
                    res.end('Release did not sent, don\'t know reason');
                }
            }).catch(e => {
                res.end('Release did not created, reason: ' + e.message);
            })
       
        } else {
            res.statusCode = 400;
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
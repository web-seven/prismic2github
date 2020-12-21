const http = require('http');
const semver = require('semver');
const { Octokit } = require("@octokit/rest");

const hostname = process.env.PROXY_HOST_NAME ? process.env.PROXY_HOST_NAME : '0.0.0.0';
const port = process.env.PROXY_PORT ? process.env.PROXY_PORT : 8080;

const server = http.createServer((req, res) => {
    let payload = '';
    req.on('data', (chunk) => {
        payload += chunk;
    });

    req.on('end', async () => {
        if (payload.length > 0) {
            const data = JSON.parse(payload);
            const [basepath, owner, repo, branch] = req.url.replace(/^\/|\/$/g, '').split('/');
            if (!owner || !repo || !branch) {
                res.statusCode = 400;
                res.end('Github repository owner, repo name or branch not found, please define it in URL eg.: /prismic/{owner}/{repo}/{branch}');
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
                releaseName = data.releases.addition[0].label;
            } else if (data.releases.update) {
                releaseName = data.releases.update[0].label;
            } else if (data.releases.deletion) {
                releaseName = data.releases.deletion[0].label;
            } else {
                res.statusCode = 400;
                res.end('Payload not contain data for create or update release');
                return;
            }

            let version = semver.valid(semver.coerce(releaseName));
            if (!version) {
                res.statusCode = 400;
                res.end('Just SemVer lables with wildcards supported.');
                return;
            }

            let tagsCount = 100;
            let page = 0;

            while (tagsCount >= 100) {
                page++;
                let tags = await octokit.repos.listTags({
                    owner: owner,
                    repo: repo,
                    per_page: 100,
                    page: page,
                });
                tags.data.forEach(tag => {
                    if (semver.valid(tag.name) && semver.satisfies(tag.name, releaseName)) {
                        if (semver.gt(tag.name, version) || semver.eq(tag.name, version)) {
                            version = semver.inc(semver.valid(tag.name), 'patch');
                        }
                    }
                })
                tagsCount = tags.data.length;
            }

            octokit.repos.getBranch({
                owner: owner,
                repo: repo,
                branch: branch
            }).then((branchData) => {
                octokit.repos.createRelease({
                    owner: owner,
                    repo: repo,
                    name: "Prismic.io release: " + releaseName,
                    tag_name: version,
                    target_commitish: branchData.data.commit.sha
                }).then((releaseData) => {
                    if (releaseData.status === 201) {
                        res.end(`Release ${version} linked to ${branchData.data.commit.sha} was successfully creates in "${owner}/${repo}".`);
                    } else {
                        res.end('Release not created, don\'t know reason');
                    }
                }).catch(e => {
                    res.end('Release not created, reason: ' + e.message);
                })
            });
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
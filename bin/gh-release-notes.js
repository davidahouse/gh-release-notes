#!/usr/bin/env node
const program = require("commander");
require("pkginfo")(module);
const { Octokit } = require("@octokit/rest");
const fs = require("fs");

program
  .option("-t, --token <token>", "GitHub access token")
  .option("-h, --host <host>", "Github host API path")
  .option("-o, --owner <owner>", "Github owner/organization")
  .option("-r, --repository <repository>", "Repository name")
  .option("-i, --input <input>", "Input file name if setting release text")
  .option("-o, --output <output>", "Output file for collected release notes")
  .option("-a, --action <action>", "recent, milestone or update")
  .option("-t, --hours <hours>", "time in hours")
  .option(
    "-m, --milestone <milestone>",
    "Milestone if we are collecting release notes from a milestone"
  )
  .option("-n, --name <name>", "Release name if we are updating")
  .option("-b, --branch <branch>", "Branch if we are pulling recent");

program.parse(process.argv);

console.log("gh-release-notes:");
console.log(module.exports.version);

try {
  const authorizedOctokit = new Octokit({
    auth: "token " + program.token,
    userAgent: "octokit/rest.js v1.2.3",
    baseUrl: program.host,
    log: {
      debug: console.log,
      info: console.log,
      warn: console.warn,
      error: console.error
    }
  });

  if (program.action === "recent") {
    recentPullRequests(authorizedOctokit, program.hours, program.output);
  } else if (program.action === "milestone") {
    milestonePullRequests(
      authorizedOctokit,
      program.owner,
      program.repository,
      program.milestone,
      program.output
    );
  } else if (program.action === "update") {
    updateRelease(
      authorizedOctokit,
      program.owner,
      program.repository,
      program.name,
      program.input
    );
  } else {
    console.log("Unknown action argument: " + program.action);
    process.exit(1);
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}

async function recentPullRequests(authorizedOctokit, hours, output) {
  let done = false;
  let page = 1;
  let releaseNotes = "";
  const oldest = 1000 * 60 * 60 * hours;

  while (!done) {
    const pullRequests = await authorizedOctokit.pulls.list({
      owner: program.owner,
      repo: program.repository,
      state: "closed",
      base: program.branch,
      sort: "updated",
      direction: "desc",
      page: page
    });

    if (pullRequests.data != null && pullRequests.data.length > 0) {
      for (let index = 0; index < pullRequests.data.length; index++) {
        const pr = pullRequests.data[index];
        if (pr.merged_at != null) {
          const merged = Date.parse(pr.merged_at);
          const age = new Date() - merged;
          if (age < oldest) {
            releaseNotes += "- [" + pr.number + "] " + pr.title + "\n";
          } else {
            done = true;
          }
        }
      }
      page += 1;
    } else {
      done = true;
    }
  }

  if (output != null) {
    fs.writeFileSync(output, releaseNotes);
  }
}

async function milestonePullRequests(
  authorizedOctokit,
  owner,
  repo,
  milestone,
  output
) {
  const milestones = await authorizedOctokit.issues.listMilestonesForRepo({
    owner: owner,
    repo: repo,
    state: "open"
  });

  let milestoneNumber = null;
  for (let index = 0; index < milestones.data.length; index++) {
    if (milestones.data[index].title === milestone) {
      milestoneNumber = milestones.data[index].number;
    }
  }

  if (milestoneNumber != null) {
    let done = false;
    let page = 1;
    let releaseNotes = "";

    while (!done) {
      const issues = await authorizedOctokit.issues.listForRepo({
        owner: owner,
        repo: repo,
        milestone: milestoneNumber,
        state: "all",
        page: page,
        sort: "updated",
        direction: "desc"
      });

      if (issues.data != null && issues.data.length > 0) {
        for (let index = 0; index < issues.data.length; index++) {
          const issue = issues.data[index];
          releaseNotes += "- [" + issue.number + "] " + issue.title + "\n";
        }
        page += 1;
      } else {
        done = true;
      }
    }

    if (output != null) {
      fs.writeFileSync(output, releaseNotes);
    }
  } else {
    console.log("Milestone " + milestone + " not found");
  }
}

async function updateRelase(authorizedOctokit, owner, repo, tag, input) {
  let releaseNotes = null;
  if (input != null) {
    releaseNotes = fs.readFileSync(input);
  }

  if (releaseNotes != null) {
    const release = await authorizedOctokit.repos.getReleaseByTag({
      owner: owner,
      repo: repo,
      tag: tag
    });
    console.dir(release);

    const fullReleaseNotes = release.data.body != null ? release.data.body : "";
    fullReleaseNotes += "\n";
    fullReleaseNotes += releaseNotes;

    const update = await authorizedOctokit.repos.updateRelease({
      owner: owner,
      repo: repo,
      release_id: release.data.id,
      body: fullReleaseNotes
    });
  } else {
    console.log("No release notes found");
  }
}

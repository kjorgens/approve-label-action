const core = require('@actions/core');
const github = require('@actions/github');
const ghpkg = require('@octokit/graphql');
const { graphql } = ghpkg;

const getTeamList = `query($teamSlug: String!, $owner: String!) {
  organization(login: $owner) {
    team(slug: $teamSlug) {
      members(membership:ALL) {
        edges {
          node {
            login
            email
            name
          }
        }
      }
    }
  }
}`;

async function getTeamArray(teamName, owner, sender) {
  const members = await graphql(getTeamList, {
    teamSlug: teamName,
    owner: owner,
    headers: {
      authorization: `token ${process.env.GH_TOKEN || core.getInput('github-token')}`
    }
  });

  if (members.organization.team === null) {
    core.setFailed(`can't find ${teamName} in ${owner} organization`);
    process.exit(1);
  }
  return members.organization.team.members.edges.find((member) => {
    return member.node.login === sender;
  })
}

(async () => {
  try {
    const approvers = await getTeamArray('devops', 'sunrun', 'kjorgens');

    const sender = github.context.payload.sender.login;
    const expectedLabel = 'Label Action';
    const org = core.getInput('organization') || github.context.payload.organization.login;
    console.log(`using org ${org}`);
    const teams = core.getInput('valid-approval-teams');
    const teamSlugs = teams.split(',');
    let validApprover = false;
    await Promise.all(teamSlugs.map(async (team) => {
      try {
        const approvers = await getTeamArray(team.trim(), org, sender);
        if (approvers) {
          validApprover = true;
        }
      } catch(err) {
        console.log(err.message);
      }
    }));

    if (!validApprover || expectedLabel !== 'Label Action') {
      core.setFailed(`${sender} is not a valid approver for label ${expectedLabel}`);
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    core.setFailed(error.message);
    process.exit(1);
  }
})();

"""
Production deploys once per change to main.

The Deploy workflow runs after CI succeeds on main. A pull request whose head
branch is main (the main -> test sync PR) also runs CI on the same commit with
head_branch "main", so without a check on the triggering event every merge to
main deployed, and published a GitHub Release, twice.
"""

from pathlib import Path

import yaml

WORKFLOW = Path(__file__).resolve().parent.parent / ".github" / "workflows" / "deploy.yml"


def _deploy_condition() -> str:
    jobs = yaml.safe_load(WORKFLOW.read_text())["jobs"]
    return " ".join(jobs["deploy"]["if"].split())


def test_automatic_deploys_only_follow_ci_for_a_push():
    condition = _deploy_condition()

    assert "github.event.workflow_run.conclusion == 'success'" in condition
    assert "github.event.workflow_run.event == 'push'" in condition


def test_manual_deploys_still_run():
    assert _deploy_condition().startswith("github.event_name == 'workflow_dispatch' ||")


def test_release_only_follows_a_deploy():
    jobs = yaml.safe_load(WORKFLOW.read_text())["jobs"]

    assert jobs["release"]["needs"] == "deploy"

#!/bin/bash

# Copy skills to Claude directory
mkdir -p ~/.claude/skills
cp -r "$PWD/skills/"* ~/.claude/skills/

# Copy workflows to user-chosen directory
default_wf_dir="~/workflows"
wf_dir="$(dirname "$0")/workflows"
mkdir -p "$wf_dir"
cp -r "$PWD/workflows/"* "$wf_dir"

echo "Installation complete:"
echo "- Skills installed to ~/.claude/skills"
echo "- Workflows installed to $wf_dir"

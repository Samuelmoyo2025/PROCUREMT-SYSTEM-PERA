#!/bin/sh
cd "$(dirname "$0")"
{ cat src/1-head.html; echo '<script>'; cat src/2-core.js src/3-seed.js src/4-views.js src/4b-catalogue.js src/4c-reports.js src/5-detail.js src/6-actions.js src/6b-more.js src/6c-account.js src/6d-requisition.js src/6e-workflow.js src/7-scan.js src/9-boot.js; echo '</script>'; } > index.html

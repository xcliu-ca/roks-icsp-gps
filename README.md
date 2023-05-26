# Syncing global pull secret and image content source policy in ROKS

## Global Pull Secret is supported but does not sync to nodes
- `oc -n openshift-config get secret pull-secret -o jsonpath="{.data.\.dockerconfigjson}" | base64 -d | jq`
- `oc set data secret/pull-secret -n openshift-config --from-file=.dockerconfigjson=dockerconfig.json`
- should be synced to worker:`/.docker/config.json`
- no worker reboot needed

## Image Content Source Policy is supported but does not sync to nodes
- `oc get imagecontentsourcepolicy -o yaml` 
- should be synced to worker:`/etc/containers/registries.conf`
- worker reboot required

## Solution
- deploy a `deamonset` to run on worker nodes
- the container mount worker filesystem
- the container sychronizes Global Pull Secret to disk
- the container sychronizes Image Content Source Policy to disk
- ~~worker reboot looks like not necessary for ocp 4.9+~~ - for `global pull secret` only
- worker still needs reboot for `image content source policy`

## Benefit
- ~~no `ibmcloud` credentials required~~
- easy with a `daemonset` deploy
- no difference thereafter with regular openshift env
- flexible (no pre-defined staff)

## Steps
1. have `oc` cli available
2. have `oc` configured
3. export your ibmcloud api key `export IBMCLOUD_APIKEY=replace-with-your-api-key`
4. [for classic roks] export your ibmcloud cluster and region information `export IBMCLOUD_REGION=replace-with-cluster-region; export IBMCLOUD_CLUSTER=replace-with-cluster-name-or-id`
5. install `daemonset` by executing [script](enabler.sh) `./enabler.sh`
6. treat `roks` no difference with other `openshift` env

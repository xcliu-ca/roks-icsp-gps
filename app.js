const fs = require("fs")
const os = require("os")
const Koa = require('koa')
const bodyParser = require("koa-bodyparser")
const vcore = require("@vueuse/core")
const vmath = require("@vueuse/math")
const execa = require("execa")
const chalk = require("chalk")
const seventh = require("seventh")
const { ref, computed, watch } = require("vue")
// console.log(Object.keys(vmath))
// console.log(Object.keys(execa))

const backup_dockerconfig = JSON.parse(fs.readFileSync("/host/.docker/config.json.backup", "utf8"))
const backup_registries = fs.readFileSync("/host/etc/containers/registries.conf.backup", "utf8")
const POD = os.hostname()

// reactive variables 
const node_name = ref('node_name')
const worker_id = ref('worker_id')
const version_disk = ref('vanilla')
const version_current = ref('vanilla')
const icsp_result = ref({})
const gps_result = ref({})
const gps = ref('')
const icsp = ref({})
// global flags
const ocp_available = ref(false) //  indicating that ocp cluster is good
const in_sync = computed(() => version_disk.value === version_current.value)
const icsp_available = computed(() => icsp_result.value.hasOwnProperty("items") && icsp_result.value.items.length > 0) // indicating that there are icsp to sync
const gps_available = computed(() => gps_result.value.hasOwnProperty("data")) //  indicating that there are global pull secret
const updates_available = vmath.logicAnd(icsp_available, gps_available) // indicating that there are both icsp and global pull secret to sync

// conditions and triggers
watch(version_current, () => {
  console.log(`version_disk=${version_disk.value}`)
  console.log(`version_current=${version_current.value}`)
  if (version_current.value !== version_disk.value) {
    // should update worker files and reboot, with version in disk updated
    if (updates_available.value && ocp_available.value) {
      console.log(`!!!!!! ready for updating files and reboot node`)
      fs.writeFileSync("/host/version", version_current.value, "utf8")
      fs.writeFileSync("/host/.docker/config.json", JSON.stringify({auths: Object.assign({}, backup_dockerconfig.auths, decode(gps.value).auths)},"",2), "utf8")
      fs.writeFileSync("/host/etc/containers/registries.conf", backup_registries + Object.values(icsp.value).join("\n"), "utf8")
      console.log(`!!!!!! rebooting for icsp`)
      reboot().then(console.log(`.!. worker ${node_name.value} rebooted`))
    } else {
      console.log(`...... not ready yet updating files and reboot node`)
    }
  }
})
watch(version_disk, () => {
  console.log(`version_current=${version_current.value}`)
  console.log(`version_disk=${version_disk.value}`)
  if (version_current.value !== version_disk.value) {
    if (updates_available.value && ocp_available.value) {
      console.log(`!!!!!! ready for updating files and reboot node`)
      fs.writeFileSync("/host/version", version_current.value, "utf8")
      fs.writeFileSync("/host/.docker/config.json", JSON.stringify({auths: Object.assign({}, backup_dockerconfig.auths, decode(gps.value).auths)},"",2), "utf8")
      fs.writeFileSync("/host/etc/containers/registries.conf", backup_registries + Object.values(icsp.value).join("\n"), "utf8")
      // only reboot for version_current updates
    }
  }
})

vcore.whenever(updates_available, () => {
  console.log(chalk.red(`both icsp and gps status refreshed ? ${updates_available.value}`))
  setTimeout(() => {
    if (icsp_available.value) {
      version_current.value = Object.keys(icsp.value).join("-")
    }
  }, 1000)
})

// watch(icsp, () => Object.entries(icsp.value).forEach(entry => console.log(entry[1])))
watch(in_sync, () => {
  if (!in_sync.value) {
    setTimeout(() => { console.log(`.!. resetting icsp_result`); icsp_result.value = {}}, 2000 + Math.floor(Math.random() * 10 * 1000))
  }
})
watch(icsp, () => {
  Object.entries(icsp.value).forEach(entry => console.log(`icsp: ${entry[0]}`))
  if (updates_available.value) {
    version_current.value = Object.keys(icsp.value).join("-")
  }
})
watch(gps, () => fs.writeFileSync("/host/.docker/config.json", JSON.stringify({auths: Object.assign({}, backup_dockerconfig.auths, decode(gps.value).auths)},"",2), "utf8"))
watch(gps_result, () => gps.value = gps_result.value.data[".dockerconfigjson"])
watch(icsp_result, () => {
  if (icsp_result.value.hasOwnProperty("items")) {
    icsp.value = icsp_result.value.items.map(item => ({
      name: item.metadata.name,
      generation: item.metadata.generation,
      resourceVersion: item.metadata.resourceVersion,
      mirrors: item.spec.repositoryDigestMirrors
        .sort((x,y) => x.source > y.source ? 1 : -1)
        .reduce((acc, value) => {
          let result = acc + `[[registry]]
  location = "${value.source}"
  insecure = false
  blocked = false
  mirror-by-digest-only = false
  prefix = ""

`
          value.mirrors.sort((x,y) => x > y ? 1 : -1).forEach(mirror => result += `  [[registry.mirror]]
  location = "${mirror}"
  insecure = false

`)
          return result
        }, '')
    })).sort((x,y) => x.name > y.name ? 1 : -1)
       .reduce((acc, value) => ({...acc, [value.name + '-' + value.generation + '-' + value.resourceVersion]: value.mirrors}), {})

    if (updates_available.value) {
      version_current.value = Object.keys(icsp.value).join("-")
    }
  }
})

try {
  version_disk.value = fs.readFileSync("/host/version", "utf8").trim()
} catch (e) {
  console.log(chalk.red(`.!. error reading /host/version`))
}

// updates imagecontentsourcepolicy and global pull secret every minute
execa.command(`oc -n kube-system get pod ${POD} -o json --insecure-skip-tls-verify=true`, {shell: true}).then(result => {
  node_name.value = JSON.parse(result.stdout).spec.nodeName
  console.log(`node_name = ${node_name.value}`)
  execa.command(`oc -n kube-system get node ${node_name.value} -o json --insecure-skip-tls-verify=true`, {shell: true}).then(r => {
    worker_id.value = JSON.parse(r.stdout).metadata.labels["ibm-cloud.kubernetes.io/worker-id"]
    console.log(`worker_id = ${worker_id.value}`)
  })
})
status().then(() => refresh()).then(() => status())
setInterval(refresh, 37 * 1000)
setInterval(status, 17 * 1000)



// for koa application
function APIError (code, message) {
  this.code = code || 'internal:unknown_error'
  this.message = message || ''
  this.flag_ocp = ocp_available.value
  this.flag_gps = gps_available.value
  this.flag_icsp = icsp_available.value
  this.flag_updates = updates_available.value
  this.flag_in_sync = in_sync.value
  this.version = version_current.value
  this.node_name = node_name.value
  this.worker_id = worker_id.value
}

const app = new Koa();
app.use(bodyParser())

// save parameters
app.use(async (ctx, next) => {
  ctx.body = ctx.request.body
  ctx.response.type = 'application/json'
  ctx.response.status = 200
  await next()
})

// install restify
app.use(async (ctx, next) => {
  ctx.rest = (data) => {
    ctx.response.body = Object.assign(data, {
      flag_ocp: ocp_available.value,
      flag_gps: gps_available.value,
      flag_icsp: icsp_available.value,
      flag_updates: updates_available.value,
      flag_in_sync: in_sync.value,
      version: version_current.value,
      node_name: node_name.value,
      worker_id: worker_id.value
    })
  }
  try {
    await next()
  } catch (e) {
    ctx.response.status = 400
    ctx.response.body = {
      code: e.code || 'internal:unknown_error',
      message: e.message || '',
      flag_ocp: ocp_available.value,
      flag_gps: gps_available.value,
      flag_icsp: icsp_available.value,
      flag_updates: updates_available.value,
      flag_in_sync: in_sync.value,
      version: version_current.value,
      node_name: node_name.value,
      worker_id: worker_id.value
    }
  }
})

// answer request
app.use(async (ctx, next) => {
  await next()
  ctx.rest({})
});

// cluster health
app.use(async (ctx, next) => {
  if (!ocp_available.value) {
    throw new APIError('env:cluster', 'cluster not queryable')
  }
  await next()
});

// can update
app.use(async (ctx, next) => {
  if (!updates_available.value) {
    throw new APIError('env:configuration', 'not ready to sync yet')
  }
  await next()
});

app.listen(3000);
console.log(chalk.cyan('api started at port 3000...'))

// function to reboot nodes
async function reboot() {
  console.log(chalk.green(`... rebooting`))
  try {
    await seventh.resolveTimeout(Math.floor(1000 * 60 * 5 * Math.random()))
    const result = await execa.command(`ibmcloud cs worker reboot --worker ${worker_id.value} -c ${process.env.IBMCLOUD_CLUSTER} -f`, {shell: true})
    console.log(result.stdout)
  } catch (e) {console.log(e)}
}

// function to query status
async function status(url_addr="http://127.0.0.1:3000", timeout=20) {
  console.log(chalk.green(`... querying`))
  try {
    const result = await execa.command('curl localhost:3000', {shell: true})
    console.log(JSON.parse(result.stdout))
  } catch (e) {}
}

// function to refresh with imagecontentsourcepolicy and global pull secret
async function refresh () {
  console.log(chalk.green(`... refreshing`))
  try {
    version_disk.value = fs.readFileSync("/host/version", "utf8").trim()
  } catch (e) { console.error(e)}
  try {
    gps_result.value = JSON.parse((await execa.command('oc -n openshift-config get secret pull-secret -o json --insecure-skip-tls-verify=true', {shell: true})).stdout)
    ocp_available.value = true
  } catch (e) {
    console.error(e)
    ocp_available.value = false
  }
  try {
    icsp_result.value = JSON.parse((await execa.command('oc get imagecontentsourcepolicy -o json --insecure-skip-tls-verify=true', {shell: true})).stdout)
    ocp_available.value = true
  } catch (e) {
    console.error(e)
    ocp_available.value = false
  }
}

// base64 decoder
function decode(encoded="") {
  const decodedStr = Buffer.from(encoded.trim(), 'base64').toString('utf-8')
  if (!decodedStr) {
    return ''
  }
  return JSON.parse(decodedStr)
}

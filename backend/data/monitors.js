const monitors = [];

function getAll() {
    return monitors; //is it fetching?
}


//adds on top of the preexisting monitors?
function createMonitor({ name, url, status, checkedAt}) {
    //for each new monitors, it adds the id and other default fields
const monitor = {
        id: Date.now().toString() + monitors.length,
            name,
            url,
            environment: 'Dev',
            status,
            lastChecked: checkedAt,
            uptime7days: 0,
            uptime30days: 0,
            createdAt: new Date().toISOString(),
        };  //lastChecked --> checkedAt on server
        //status gets updated on the server via pinger.js
        monitors.push(monitor);
        return monitor;
}

function getMultiple(ids) {
    return monitors.filter(m => ids.includes(m.id));
}

module.exports = { getAll, getMultiple, createMonitor };
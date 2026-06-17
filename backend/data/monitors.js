const monitors = [];

function getAll() {
    return monitors; //is it fetching?
}


//adds on top of the preexisting monitors?
function addMultiple(newMonitors) {
    //for each new monitors, it adds the id and other default fields
    const created = newMonitors.map((item, index) => {
        const monitor = {
            id: Date.now().toString() + index,
            name:item.name,
            url:item.url,
            environment: 'Dev',
            status: 'Unknown',
            lastChecked: null,
            uptime7days: null,
            uptime30days: null,createdAt: new Date().toISOString(),
        };  
        monitors.push(monitor);
        return monitor;
    });
    return created;
}

module.exports = { getAll, addMultiple };
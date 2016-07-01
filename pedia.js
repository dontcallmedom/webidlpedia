fetch("results.json")
    .then(r => r.json())
    .then(data => {
        const body = document.querySelector("body");
        const params = location.search.slice(1);
        const paramName = params.split("=")[0] || null;
        const paramValue = params.split("=")[1] || null;
        switch(paramName) {
        case "idlname":
            body.appendChild(interfaceDetails(data, paramValue));
            break;
        case "enums":
            body.appendChild(enumNames(data, paramValue));
            break;
        default:
            body.appendChild(fullList(data));
        }
    });

function fullList(data) {
    const section = document.createElement("section");
    [{type:"interface", title: "Interfaces"}, {type: "dictionary", title:"Dictionaries"}, {type:"typedef", title:"Typedefs"}, {type:"enum", title: "Enums"}].forEach(
        type => {
            const h2 = document.createElement("h2");
            h2.textContent = type.title;

            section.appendChild(h2);
            const ol = document.createElement("ol");
            const names = data.filter(hasIdlDef)
                  .map(spec =>
                       Object.keys(spec.idl.idlNames)
                       .filter(n => n!=="_dependencies")
                       .filter(n => spec.idl.idlNames[n].type === type.type)
                      ).reduce((a,b) => a.concat(b), [])
                  .sort();
            names.forEach(name => {
                const item = document.createElement("li");
                const link = document.createElement("a");
                link.href= "?idlname=" + name;
                link.textContent = name;
                item.appendChild(link);
                ol.appendChild(item);
            });
            section.appendChild(ol);
        });
    return section;
}

function interfaceDetails(data, name) {
    const section = document.createElement("section");
    const h2 = document.createElement("h2");
    h2.textContent = name;
    section.appendChild(h2);
    
    data.filter(hasIdlDef)
        .filter(spec => spec.idl.idlNames[name])
        .forEach(spec => {
            const link = document.createElement("a");
            link.textContent = spec.title + " defines " + name;
            link.href= spec.url;
            section.appendChild(link);

        });
    const ol = document.createElement("ol");
    data.filter(s => s.idl && s.idl.externalDependencies && s.idl.externalDependencies.indexOf(name) !== -1)
        .forEach(spec => {
            const item = document.createElement("li");
            const link = document.createElement("a");
            link.textContent = spec.title + " refers to " + name + "";
            link.href= spec.url;
            item.appendChild(link);
            ol.appendChild(item);
        });
    if (ol.childNodes.length) {
        section.appendChild(ol);
    }
    return section;
}

function enumNames(data, sort) {
    const section = document.createElement("section");
    const h2 = document.createElement("h2");
    h2.textContent = "Names used in enumerations";
    section.appendChild(h2);

    const sortFn = sort === "popularity" ? ((e1, e2) => e2.specs.length - e1.specs.length) : ((e1,e2) => -1);

    const sorter = document.createElement("a");
    sorter.href = "?enums=" + (sort === "popularity" ? "" : "popularity");
    sorter.textContent = "Sort by " + (sort === "popularity" ? "name" : "popularity");
    section.appendChild(sorter);

    const ol = document.createElement("ol");
    data.filter(hasIdlDef)
    const enumValues = data.filter(hasIdlDef)
          .map(spec =>
               Object.keys(spec.idl.idlNames)
               .filter(n => n!=="_dependencies")
               .filter(n => spec.idl.idlNames[n].type === "enum")
               .map(n => spec.idl.idlNames[n].values.map(v =>
                                                         {return {url: spec.url,title: spec.title, enumName: n, value: v};})
                    .reduce((a,b) => a.concat(b), [])))
          .reduce((a,b) => a.concat(b), [])
          .reduce((a,b) => a.concat(b), [])
          .sort((a,b) => a.value < b.value ? -1 : (a.value > b.value ? 1 : 0));
    const uniqueNames = enumValues.map(e => e.value);
    const uniqueEnumValues = enumValues.filter((e, i) => i === uniqueNames.indexOf(e.value))
          .map(e => {
              const matchingEnums = enumValues.filter(f => f.value === e.value);
              return {value: e.value,
                      specs: matchingEnums.map(f => { return {enumName: f.enumName, title: f.title, url: f.url};})
                     };
          }).
          sort(sortFn);
    console.log(uniqueNames);
    uniqueEnumValues.forEach(e => {
        const item = document.createElement("li");
        item.appendChild(document.createTextNode(e.value));
        const specList = document.createElement("ol");
        e.specs.forEach(s => {
            const spec = document.createElement("li");
            spec.appendChild(document.createTextNode(" used in enum " + s.enumName + " in "));
            const link = document.createElement("a");
            link.href=s.url;
            link.textContent = s.title;
            spec.appendChild(link)
            specList.appendChild(spec);
        });
        item.appendChild(specList);
        ol.appendChild(item);
    });
    section.appendChild(ol);
    return section;

}

var hasIdlDef = s => s.idl && s.idl.idlNames;

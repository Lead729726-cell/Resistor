const path=require('node:path');
// Keep the historical data directory: changing a display name must not hide
// existing workspaces, local preferences or the worker connection.
function configureAppIdentity(app,{userDataOverride}={}){
  const userData=userDataOverride?path.resolve(userDataOverride):path.join(app.getPath('appData'),'레지스터');
  app.setName('Resistor');
  app.setPath('userData',userData);
  return userData;
}
module.exports={configureAppIdentity};

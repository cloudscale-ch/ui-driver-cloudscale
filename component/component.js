/*!!!!!!!!!!!Do not change anything between here (the DRIVERNAME placeholder will be automatically replaced at buildtime)!!!!!!!!!!!*/
import NodeDriver from 'shared/mixins/node-driver';

// import uiConstants from 'ui/utils/constants'

// do not remove LAYOUT, it is replaced at build time with a base64 representation of the template of the hbs template
// we do this to avoid converting template to a js file that returns a string and the cors issues that would come along with that
const LAYOUT;
/*!!!!!!!!!!!DO NOT CHANGE END!!!!!!!!!!!*/


/*!!!!!!!!!!!GLOBAL CONST START!!!!!!!!!!!*/
// EMBER API Access - if you need access to any of the Ember API's add them here in the same manner rather then import them via modules, since the dependencies exist in rancher we dont want to expor the modules in the amd def
const computed = Ember.computed;
const get = Ember.get;
const set = Ember.set;
const alias = Ember.computed.alias;
const service = Ember.inject.service;

/*!!!!!!!!!!!GLOBAL CONST END!!!!!!!!!!!*/


const onlyDigit = /^[0-9]+$/;

const RootType = 'root';
const SSDType = 'ssd';
const BulkType = 'bulk';

const humanTypes = {
  'root': 'Root volume size',
  'ssd': 'SSD volume sizes',
  'bulk': 'Bulk volume sizes'
};

export function validateVolume(type, volumes) {
  const typeHuman = humanTypes[type];
  console.log(volumes);
  if (!volumes.every(s => onlyDigit.test(s))) {
    return [`${typeHuman} may only contain digits.`];
  }

  const parsed = volumes.map(s => parseInt(s, 10));
  if (!parsed.every(i => i > 0)) {
    return [`${typeHuman} may only contain positive numbers.`]
  }

  if (type === BulkType && !parsed.every(i => i % 100 === 0)) {
    return [`${typeHuman} must be a multiple of 100 GB in size.`]
  }

  if (type === RootType && !parsed.every(i => i >= 10)) {
    return [`${typeHuman} must be at least 10 GB.`]
  }

  return [];
}

function ensureNotNull(key, defaultValue) {
  const value = get(this, key);
  if (value === null) {
    set(this, key, defaultValue);
  }
}

/*!!!!!!!!!!!DO NOT CHANGE START!!!!!!!!!!!*/
export default Ember.Component.extend(NodeDriver, {
  driverName: '%%DRIVERNAME%%',
  needAPIToken: true,
  config: alias('model.%%DRIVERNAME%%Config'),
  app: service(),

  init() {
    // This does on the fly template compiling, if you mess with this :cry:
    const decodedLayout = window.atob(LAYOUT);
    const template = Ember.HTMLBars.compile(decodedLayout, {
      moduleName: 'nodes/components/driver-%%DRIVERNAME%%/template'
    });
    set(this, 'layout', template);

    this._super(...arguments);

  },
  /*!!!!!!!!!!!DO NOT CHANGE END!!!!!!!!!!!*/

  // Write your component here, starting with setting 'model' to a machine with your config populated
  bootstrap: function () {
    // bootstrap is called by rancher ui on 'init', you're better off doing your setup here rather then the init function to ensure everything is setup correctly
    let config = get(this, 'globalStore').createRecord({
      type: '%%DRIVERNAME%%Config',
      flavor: 'flex-4', // 4 GB Ram
      image: 'ubuntu-18.04',
      zone: undefined,
      volumeSizeGb: '50', //GB
      userdata: '',
      sshUser: 'root',
      usePrivateNetwork: false,
      useIpv6: false,
      serverGroups: [],
      volumeSsd: [],
      volumeBulk: []
    });

    set(this, 'model.%%DRIVERNAME%%Config', config);
  },

  afterInit: function () {
    ensureNotNull.call(this, 'config.serverGroups', []);
    ensureNotNull.call(this, 'config.volumeSsd', []);
    ensureNotNull.call(this, 'config.volumeBulk', []);
  }.on('init'),

  // Add custom validation beyond what can be done from the config API schema
  validate() {
    // Get generic API validation errors
    this._super();
    var errors = get(this, 'errors') || [];
    if (!get(this, 'model.name')) {
      errors.push('Name is required');
    }

    var volumeSizeGb = get(this, 'config.volumeSizeGb');
    var volumeSsd = get(this, 'config.volumeSsd') || [];
    var volumeBulk = get(this, 'config.volumeBulk') || [];
    errors.push(...validateVolume(RootType, [volumeSizeGb]));
    errors.push(...validateVolume(SSDType, volumeSsd));
    errors.push(...validateVolume(BulkType, volumeBulk));


    // Set the array of errors for display,
    // and return true if saving should continue.
    if (get(errors, 'length')) {
      set(this, 'errors', errors);
      return false;
    } else {
      set(this, 'errors', null);
      return true;
    }
  },
  // Any computed properties or custom logic can go here
  actions: {
    getData() {
      this.set('gettingData', true);
      let that = this;
      Promise.all([
          this.apiRequest('/v1/images'),
          this.apiRequest('/v1/flavors'),
          this.apiRequest('/v1/regions'),
          this.apiRequest('/v1/server-groups')
        ]
      ).then(([imageChoices, flavorChoices, regions, serverGroupsChoices]) => {
        const getZonesFromRegions = (regions) => regions.reduce((accu, region) => [...accu, ...region.zones], []);
        const zoneChoices = getZonesFromRegions(regions);
        that.setProperties({
          errors: [],
          needAPIToken: false,
          gettingData: false,
          imageChoices: imageChoices,
          flavorChoices: flavorChoices,
          zoneChoices: zoneChoices,
          serverGroupsChoices: serverGroupsChoices
        });
      }).catch(function (err) {
        err.then(function (msg) {
          that.setProperties({
            errors: ['Error received from cloudscale.ch API: ' + JSON.stringify(msg)],
            gettingData: false
          })
        })
      })
    },
    handleServerGroupChange(serverGroup) {
      if (!serverGroup) {
        set(this, 'config.serverGroups', []);
        return;
      }
      set(this, 'config.serverGroups', [serverGroup]);
    },
    handleImageChange(newImageSlug) {
      // There are some images that do not allow login as root, therefore
      // we always set the sshUser according to the image default user.
      const imageChoices = get(this, 'imageChoices');
      const newImage = imageChoices.find(c => c.slug === newImageSlug);
      set(this, 'config.image', newImageSlug);
      set(this, 'config.sshUser', newImage.default_username);
    },
    handleZoneChange(zone) {
      set(this, 'config.zone', zone);
    },
    handleVolumeSSDChange(volumes) {
      set(this, 'config.volumeSsd', volumes || []);
    },
    handleVolumeBulkChange(volumes) {
      set(this, 'config.volumeBulk', volumes || []);
    }
  },
  apiRequest(path) {
    return fetch('https://api.cloudscale.ch' + path, {
      headers: {
        'Authorization': 'Bearer ' + this.get('config.token'),
      },
    }).then(res => res.ok ? res.json() : Promise.reject(res.json()));
  },
});

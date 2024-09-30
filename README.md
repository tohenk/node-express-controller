# Nodejs Express Controller

Nodejs Express Controller is a helper class to define routes in [Expressjs](https://expressjs.com).

## Usage

Create a controller in `controller/app.js`.

```js
const Controller = require('@ntlab/express-controller');

class AppController extends Controller
{
    buildRoutes() {
        this.addRoute('index', 'get', '/', async (req, res, next) => {
            res.render('app/main');
        });
    }

    static create(app) {
        const prefix = '/';
        const controller = new AppController({prefix: prefix, name: 'App'});
        app.use(prefix, controller.router);
        return controller;
    }
}

module.exports = AppController.create;
```

Register it in Expressjs app.

```js
const app = express();

// controllers
const Controller = require('@ntlab/express-controller');
Controller.scan(path.join(__dirname, 'controller'), (controller, name) => {
    controller(app);
});

// sub controllers
Controller.subControllers.forEach(controller => {
    const mountPath = controller.getMountPath();
    if (mountPath) {
        app.use(mountPath, controller.router);
    }
});
```
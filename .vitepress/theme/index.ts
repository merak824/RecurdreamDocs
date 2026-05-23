import DefaultTheme from 'vitepress/theme'
import DocImage from './components/DocImage.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('DocImage', DocImage)
  }
}

import { Component } from "react";
import { Link } from "react-router-dom";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      console.error(error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="page-section">
          <div className="container narrow">
            <div className="notice-card">
              <p className="eyebrow">Something went wrong</p>
              <h1>We could not load this part of the website.</h1>
              <p>Please refresh the page or return home. No sensitive information has been exposed.</p>
              <Link className="button button-primary" to="/">
                Return Home
              </Link>
            </div>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
